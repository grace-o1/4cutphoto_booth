document.addEventListener('DOMContentLoaded', () => {

    const video            = document.getElementById('video');
    const captureBtn       = document.getElementById('capture-btn');
    const cameraView       = document.querySelector('.camera-view');
    const resultArea       = document.querySelector('.result-area');
    const finalPhotoCanvas = document.getElementById('final-photo-canvas');
    const saveBtn          = document.getElementById('save-final-image-btn');
    const stickerWorkspace = document.getElementById('sticker-workspace');

    let capturedPhotos = [];
    const MAX_PHOTOS   = 4;
    const finalCtx     = finalPhotoCanvas.getContext('2d');
    let stickers       = [];
    let activeSticker  = null;  // 캔버스 위 기존 스티커 이동용
    let offsetX = 0, offsetY = 0;

    const CANVAS_W     = 400;
    const CANVAS_H     = 400;
    const STICKER_SIZE = 60;

    // ─────────────────────────────────────────
    // 유틸
    // ─────────────────────────────────────────
    function toCanvasCoords(clientX, clientY) {
        const rect = finalPhotoCanvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left) * (CANVAS_W / rect.width),
            y: (clientY - rect.top)  * (CANVAS_H / rect.height)
        };
    }

    function isOverCanvas(clientX, clientY) {
        const r = finalPhotoCanvas.getBoundingClientRect();
        return clientX >= r.left && clientX <= r.right
            && clientY >= r.top  && clientY <= r.bottom;
    }

    // 이모지 → DataURL (외부 서버 없이 로컬 렌더링)
    function emojiToDataURL(emoji, size = 80) {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const x = c.getContext('2d');
        x.font = `${size * 0.8}px serif`;
        x.textAlign    = 'center';
        x.textBaseline = 'middle';
        x.fillText(emoji, size / 2, size / 2);
        return c.toDataURL('image/png');
    }

    // 팔레트 스티커 초기화 (data-emoji 속성으로 DataURL 생성)
    function initStickerPalette() {
        document.querySelectorAll('.sticker-item').forEach(el => {
            if (el.dataset.emoji) {
                el.src = emojiToDataURL(el.dataset.emoji);
            }
        });
    }

    // ─────────────────────────────────────────
    // 1. 웹캠 시작
    // ─────────────────────────────────────────
    async function startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', aspectRatio: 1 }
            });
            video.srcObject = stream;
            video.style.transform = 'scaleX(-1)';
            video.onloadedmetadata = () => {
                video.play();
                captureBtn.disabled = false;
            };
        } catch (err) {
            console.error('카메라 오류:', err);
            alert('카메라에 접근할 수 없습니다.');
        }
    }

    // ─────────────────────────────────────────
    // 2. 사진 찍기
    // ─────────────────────────────────────────
    captureBtn.addEventListener('click', () => {
        if (capturedPhotos.length >= MAX_PHOTOS) return;

        const snap = document.createElement('canvas');
        const ctx  = snap.getContext('2d');
        snap.width  = video.videoWidth;
        snap.height = video.videoHeight;
        ctx.translate(snap.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0);
        capturedPhotos.push(snap.toDataURL('image/png'));

        if (capturedPhotos.length < MAX_PHOTOS) {
            captureBtn.textContent = `사진찍기 ${capturedPhotos.length + 1}/${MAX_PHOTOS}`;
        } else {
            captureBtn.textContent = '촬영 완료! 편집 시작';
            captureBtn.disabled = true;
            switchToEditMode();
        }
    });

    // ─────────────────────────────────────────
    // 3. 편집 모드 전환
    // ─────────────────────────────────────────
    function switchToEditMode() {
        if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
        cameraView.style.display  = 'none';
        captureBtn.style.display  = 'none';
        resultArea.style.display  = 'block';

        finalPhotoCanvas.width  = CANVAS_W;
        finalPhotoCanvas.height = CANVAS_H;

        drawPhotosOnCanvas().then(() => {
            setupMouseDrag();
            setupTouchDrag();
        });
    }

    // ─────────────────────────────────────────
    // 4. 4컷 사진 그리기
    // ─────────────────────────────────────────
    function drawPhotosOnCanvas() {
        finalCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        const cW = CANVAS_W / 2, cH = CANVAS_H / 2;

        return Promise.all(capturedPhotos.map((src, i) =>
            new Promise(res => {
                const img = new Image();
                img.onload  = () => { finalCtx.drawImage(img, (i%2)*cW, Math.floor(i/2)*cH, cW, cH); res(); };
                img.onerror = () => res();
                img.src = src;
            })
        ));
    }

    // ─────────────────────────────────────────
    // 5. 스티커 추가 & 다시 그리기
    // ─────────────────────────────────────────
    function addStickerToCanvas(src, cx, cy) {
        const img = new Image();
        img.onload = () => {
            stickers.push({ img, x: cx - STICKER_SIZE/2, y: cy - STICKER_SIZE/2, width: STICKER_SIZE, height: STICKER_SIZE });
            redrawFinalCanvas();
        };
        img.src = src;
    }

    function redrawFinalCanvas() {
        drawPhotosOnCanvas().then(() => {
            stickers.forEach(({ img, x, y, width, height }) => {
                finalCtx.drawImage(img, x, y, width, height);
            });
        });
    }

    // ─────────────────────────────────────────
    // 6-A. PC 마우스 드래그
    // ─────────────────────────────────────────
    function setupMouseDrag() {
        let src = null;

        document.querySelectorAll('.sticker-item').forEach(item => {
            item.setAttribute('draggable', true);

            item.addEventListener('mousedown', () => { src = item.src; });

            item.addEventListener('dragstart', e => {
                src = item.src;
                e.dataTransfer.setData('text/plain', item.src);
                e.dataTransfer.effectAllowed = 'copy';
            });
        });

        stickerWorkspace.addEventListener('dragover', e => { e.preventDefault(); });

        stickerWorkspace.addEventListener('drop', e => {
            e.preventDefault();
            const s = e.dataTransfer.getData('text/plain') || src;
            if (!s) return;
            const { x, y } = toCanvasCoords(e.clientX, e.clientY);
            addStickerToCanvas(s, x, y);
            src = null;
        });

        stickerWorkspace.addEventListener('mouseup', e => {
            if (!src) return;
            const { x, y } = toCanvasCoords(e.clientX, e.clientY);
            addStickerToCanvas(src, x, y);
            src = null;
        });

        document.addEventListener('mouseup', () => { src = null; });
    }

    // ─────────────────────────────────────────
    // 6-B. 모바일 터치 드래그
    //
    // 핵심 원리:
    //   모바일 터치는 시작한 요소에 이벤트가 고정됨.
    //   팔레트 스티커에서 시작해도 캔버스에 touchmove/touchend가 안 옴.
    //   해결: 모든 move/end 를 document에 달고,
    //         changedTouches 좌표로 직접 캔버스 위 여부를 판단.
    // ─────────────────────────────────────────
    function setupTouchDrag() {

        let touchSrc = null;

        // 고스트 엘리먼트 (손가락 따라다니는 미리보기)
        const ghost = document.createElement('img');
        ghost.style.cssText = `
            position: fixed;
            width: ${STICKER_SIZE}px;
            height: ${STICKER_SIZE}px;
            pointer-events: none;
            opacity: 0.75;
            z-index: 9999;
            transform: translate(-50%, -50%);
            display: none;
        `;
        document.body.appendChild(ghost);

        // ── 팔레트 스티커에서 터치 시작 ──
        document.querySelectorAll('.sticker-item').forEach(item => {
            item.addEventListener('touchstart', e => {
                e.preventDefault();          // 스크롤 방지, 터치 이벤트 독점
                touchSrc  = item.src;
                ghost.src = item.src;
                ghost.style.display = 'block';

                const t = e.touches[0];
                ghost.style.left = t.clientX + 'px';
                ghost.style.top  = t.clientY + 'px';
            }, { passive: false });          // passive: false 필수!
        });

        // ── document 전체에서 touchmove 감지 ──
        document.addEventListener('touchmove', e => {
            if (!touchSrc) return;
            e.preventDefault();              // 스크롤 방지

            const t = e.touches[0];

            // 고스트 이동
            ghost.style.left = t.clientX + 'px';
            ghost.style.top  = t.clientY + 'px';

            // 캔버스 위에 있으면 테두리 강조
            stickerWorkspace.style.borderColor = isOverCanvas(t.clientX, t.clientY) ? '#f472b6' : '#aaa';

        }, { passive: false });              // passive: false 필수!

        // ── document 전체에서 touchend 감지 ──
        document.addEventListener('touchend', e => {
            if (!touchSrc) return;

            const t = e.changedTouches[0];  // 떼는 순간의 좌표

            ghost.style.display = 'none';
            stickerWorkspace.style.borderColor = '#aaa';

            // 손가락 뗀 위치가 캔버스 위면 → 스티커 추가
            if (isOverCanvas(t.clientX, t.clientY)) {
                const { x, y } = toCanvasCoords(t.clientX, t.clientY);
                addStickerToCanvas(touchSrc, x, y);
            }

            touchSrc = null;
        }, { passive: false });

        // ── 캔버스 위 기존 스티커 이동 (터치로 끌기) ──
        stickerWorkspace.addEventListener('touchstart', e => {
            if (touchSrc) return; // 팔레트 드래그 중이면 무시

            const t = e.touches[0];
            const { x, y } = toCanvasCoords(t.clientX, t.clientY);

            activeSticker = null;
            for (let i = stickers.length - 1; i >= 0; i--) {
                const s = stickers[i];
                if (x >= s.x && x <= s.x + s.width && y >= s.y && y <= s.y + s.height) {
                    activeSticker = s;
                    offsetX = x - s.x;
                    offsetY = y - s.y;
                    break;
                }
            }
        }, { passive: true });

        stickerWorkspace.addEventListener('touchmove', e => {
            if (!activeSticker) return;
            e.preventDefault();
            const t = e.touches[0];
            const { x, y } = toCanvasCoords(t.clientX, t.clientY);
            activeSticker.x = x - offsetX;
            activeSticker.y = y - offsetY;
            redrawFinalCanvas();
        }, { passive: false });

        stickerWorkspace.addEventListener('touchend', () => {
            activeSticker = null;
        });
    }

    // ─────────────────────────────────────────
    // 7. 저장
    // ─────────────────────────────────────────
    saveBtn.addEventListener('click', async () => {
        await drawPhotosOnCanvas();
        stickers.forEach(({ img, x, y, width, height }) => {
            finalCtx.drawImage(img, x, y, width, height);
        });

        const imageData = finalPhotoCanvas.toDataURL('image/png');
        const newTab = window.open();
        if (newTab) {
            newTab.document.writeln(`
                <html><body style="margin:0;background:#000">
                <img src="${imageData}" style="width:100%;display:block">
                <p style="text-align:center;color:#fff;padding:12px;font-size:16px">
                    📥 이미지를 길게 눌러서 저장하세요
                </p></body></html>
            `);
        } else {
            const a = document.createElement('a');
            a.href = imageData;
            a.download = 'life4cut.png';
            a.click();
        }
    });

    // ─────────────────────────────────────────
    // 시작
    // ─────────────────────────────────────────
    initStickerPalette();
    startCamera();
});
