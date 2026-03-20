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
    let activeSticker  = null;
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

    function emojiToDataURL(emoji, size = 80) {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const x = c.getContext('2d');
        x.font = `${size * 0.8}px serif`;
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText(emoji, size / 2, size / 2);
        return c.toDataURL('image/png');
    }

    function initStickerPalette() {
        document.querySelectorAll('.sticker-item').forEach(el => {
            if (el.dataset.emoji) el.src = emojiToDataURL(el.dataset.emoji);
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
        cameraView.style.display = 'none';
        captureBtn.style.display = 'none';
        resultArea.style.display = 'block';

        finalPhotoCanvas.width  = CANVAS_W;
        finalPhotoCanvas.height = CANVAS_H;

        drawPhotosOnCanvas().then(() => {
            setupStickerDrag();    // ← PC + 모바일 통합
            setupStickerMove();   // ← 캔버스 위 스티커 이동
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
    // 5. 스티커 드래그 (PC + 모바일 통합)
    //
    // ✅ Pointer Events API 사용 이유:
    //   Touch Events는 touchstart 발생 요소에 이벤트가 고정(캡처)됨
    //   → 팔레트에서 시작하면 캔버스에 이벤트가 절대 안 옴
    //
    //   Pointer Events는 pointerdown 직후
    //   releasePointerCapture()를 호출하면 캡처가 즉시 해제됨
    //   → 이후 pointermove/pointerup이 실제 손가락 위치 기준으로 발생
    //   → 모바일/PC 동일하게 동작
    // ─────────────────────────────────────────
    function setupStickerDrag() {

        let dragSrc = null;

        // 고스트 (드래그 중 미리보기)
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

        document.querySelectorAll('.sticker-item').forEach(item => {
            item.addEventListener('pointerdown', e => {
                e.preventDefault();

                dragSrc   = item.src;
                ghost.src = item.src;
                ghost.style.display = 'block';
                ghost.style.left    = e.clientX + 'px';
                ghost.style.top     = e.clientY + 'px';

                // ✅ 핵심: 캡처 즉시 해제
                //    이 한 줄이 없으면 이후 모든 이벤트가 item에 묶여서
                //    캔버스가 아무것도 못 받음
                item.releasePointerCapture(e.pointerId);

            }, { passive: false });
        });

        // pointermove: document 전체에서 감지 (캡처 해제 덕분에 정상 작동)
        document.addEventListener('pointermove', e => {
            if (!dragSrc) return;

            ghost.style.left = e.clientX + 'px';
            ghost.style.top  = e.clientY + 'px';

            // 캔버스 위면 테두리 강조
            stickerWorkspace.style.borderColor =
                isOverCanvas(e.clientX, e.clientY) ? '#f472b6' : '#aaa';
        });

        // pointerup: 캔버스 위에서 손 떼면 스티커 추가
        document.addEventListener('pointerup', e => {
            if (!dragSrc) return;

            ghost.style.display = 'none';
            stickerWorkspace.style.borderColor = '#aaa';

            if (isOverCanvas(e.clientX, e.clientY)) {
                const { x, y } = toCanvasCoords(e.clientX, e.clientY);
                addStickerToCanvas(dragSrc, x, y);
            }

            dragSrc = null;
        });
    }

    // ─────────────────────────────────────────
    // 6. 캔버스 위 기존 스티커 이동
    // ─────────────────────────────────────────
    function setupStickerMove() {

        stickerWorkspace.addEventListener('pointerdown', e => {
            const { x, y } = toCanvasCoords(e.clientX, e.clientY);

            activeSticker = null;
            for (let i = stickers.length - 1; i >= 0; i--) {
                const s = stickers[i];
                if (x >= s.x && x <= s.x + s.width
                 && y >= s.y && y <= s.y + s.height) {
                    activeSticker = s;
                    offsetX = x - s.x;
                    offsetY = y - s.y;

                    // 이동 중 캔버스 밖으로 나가도 추적
                    stickerWorkspace.setPointerCapture(e.pointerId);
                    break;
                }
            }
        });

        stickerWorkspace.addEventListener('pointermove', e => {
            if (!activeSticker) return;
            const { x, y } = toCanvasCoords(e.clientX, e.clientY);
            activeSticker.x = x - offsetX;
            activeSticker.y = y - offsetY;
            redrawFinalCanvas();
        });

        stickerWorkspace.addEventListener('pointerup', () => {
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
            a.href = imageData; a.download = 'life4cut.png'; a.click();
        }
    });

    // ─────────────────────────────────────────
    // 시작
    // ─────────────────────────────────────────
    initStickerPalette();
    startCamera();
});
