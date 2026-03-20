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
    // 유틸: 화면 좌표 → 캔버스 픽셀 좌표 변환
    // ─────────────────────────────────────────
    function toCanvasCoords(clientX, clientY) {
        const rect = finalPhotoCanvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left) * (CANVAS_W / rect.width),
            y: (clientY - rect.top)  * (CANVAS_H / rect.height)
        };
    }

    // ─────────────────────────────────────────
    // 유틸: 해당 좌표가 캔버스 위인지 확인
    // ─────────────────────────────────────────
    function isOverCanvas(clientX, clientY) {
        const rect = finalPhotoCanvas.getBoundingClientRect();
        return (
            clientX >= rect.left && clientX <= rect.right &&
            clientY >= rect.top  && clientY <= rect.bottom
        );
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
        cameraView.style.display = 'none';
        captureBtn.style.display = 'none';
        resultArea.style.display = 'block';

        finalPhotoCanvas.width  = CANVAS_W;
        finalPhotoCanvas.height = CANVAS_H;

        drawPhotosOnCanvas().then(() => {
            setupMouseDrag();  // PC
            setupTouchDrag();  // 모바일
        });
    }

    // ─────────────────────────────────────────
    // 4. 4컷 사진 그리기
    // ─────────────────────────────────────────
    function drawPhotosOnCanvas() {
        finalCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        const cellW = CANVAS_W / 2;
        const cellH = CANVAS_H / 2;

        return Promise.all(
            capturedPhotos.map((src, i) =>
                new Promise(resolve => {
                    const img = new Image();
                    img.onload = () => {
                        finalCtx.drawImage(img, (i%2)*cellW, Math.floor(i/2)*cellH, cellW, cellH);
                        resolve();
                    };
                    img.onerror = () => resolve();
                    img.src = src;
                })
            )
        );
    }

    // ─────────────────────────────────────────
    // 5. 스티커 추가 & 다시 그리기
    // ─────────────────────────────────────────
    function addStickerToCanvas(src, cx, cy) {
        const img = new Image();
        img.onload = () => {
            stickers.push({
                img,
                x: cx - STICKER_SIZE / 2,
                y: cy - STICKER_SIZE / 2,
                width:  STICKER_SIZE,
                height: STICKER_SIZE
            });
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
        let draggingSrc = null;

        document.querySelectorAll('.sticker-item').forEach(item => {
            // 마우스 드래그 방식
            item.addEventListener('mousedown', () => {
                draggingSrc = item.src;
            });
            // HTML drag & drop API 방식
            item.setAttribute('draggable', true);
            item.addEventListener('dragstart', e => {
                draggingSrc = item.src;
                e.dataTransfer.setData('text/plain', item.src);
                e.dataTransfer.effectAllowed = 'copy';
            });
        });

        stickerWorkspace.addEventListener('mouseup', e => {
            if (!draggingSrc) return;
            const { x, y } = toCanvasCoords(e.clientX, e.clientY);
            addStickerToCanvas(draggingSrc, x, y);
            draggingSrc = null;
        });

        stickerWorkspace.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });

        stickerWorkspace.addEventListener('drop', e => {
            e.preventDefault();
            const src = e.dataTransfer.getData('text/plain') || draggingSrc;
            if (!src) return;
            const { x, y } = toCanvasCoords(e.clientX, e.clientY);
            addStickerToCanvas(src, x, y);
            draggingSrc = null;
        });

        document.addEventListener('mouseup', () => { draggingSrc = null; });
    }

    // ─────────────────────────────────────────
    // 6-B. 모바일 터치 드래그
    //
    // 핵심 원리:
    //   터치 이벤트는 시작한 요소에 고정되기 때문에
    //   팔레트에서 시작한 터치는 캔버스에 도달하지 않음.
    //   → touchmove / touchend 에서 e.touches[0] 좌표를 직접 읽어
    //     document.elementFromPoint()로 어느 요소 위인지 판별.
    //     캔버스 위에서 손가락을 떼면 → 그 위치에 스티커 추가.
    // ─────────────────────────────────────────
    function setupTouchDrag() {

        let touchSrc      = null;  // 드래그 중인 스티커 src
        let ghostEl       = null;  // 화면에 따라다니는 미리보기 이미지

        // ── 팔레트 스티커 터치 시작 ──
        document.querySelectorAll('.sticker-item').forEach(item => {
            item.addEventListener('touchstart', e => {
                e.preventDefault();
                touchSrc = item.src;

                // 손가락 따라다니는 고스트 이미지 생성
                ghostEl = document.createElement('img');
                ghostEl.src = item.src;
                ghostEl.style.cssText = `
                    position: fixed;
                    width: ${STICKER_SIZE}px;
                    height: ${STICKER_SIZE}px;
                    pointer-events: none;   /* 터치 이벤트 통과 */
                    opacity: 0.75;
                    z-index: 9999;
                    transform: translate(-50%, -50%);
                `;
                document.body.appendChild(ghostEl);

                // 초기 위치
                const t = e.touches[0];
                ghostEl.style.left = t.clientX + 'px';
                ghostEl.style.top  = t.clientY + 'px';

            }, { passive: false });
        });

        // ── 손가락 이동: 고스트 따라오게 + 캔버스 강조 ──
        document.addEventListener('touchmove', e => {
            if (!touchSrc) return;
            e.preventDefault();  // 스크롤 방지

            const t = e.touches[0];

            // 고스트 위치 업데이트
            if (ghostEl) {
                ghostEl.style.left = t.clientX + 'px';
                ghostEl.style.top  = t.clientY + 'px';
            }

            // 캔버스 위에 있으면 테두리 강조 (시각 피드백)
            if (isOverCanvas(t.clientX, t.clientY)) {
                stickerWorkspace.style.outline = '3px solid #f472b6';
            } else {
                stickerWorkspace.style.outline = '';
            }

        }, { passive: false });

        // ── 손가락 떼기: 캔버스 위면 스티커 추가 ──
        document.addEventListener('touchend', e => {
            if (!touchSrc) return;

            const t = e.changedTouches[0];

            // 고스트 제거
            if (ghostEl) {
                ghostEl.remove();
                ghostEl = null;
            }
            stickerWorkspace.style.outline = '';

            // 손가락 뗀 위치가 캔버스 위인지 확인
            if (isOverCanvas(t.clientX, t.clientY)) {
                const { x, y } = toCanvasCoords(t.clientX, t.clientY);
                addStickerToCanvas(touchSrc, x, y);
            }

            touchSrc = null;
        });

        // ── 캔버스 위 기존 스티커 이동 ──
        stickerWorkspace.addEventListener('touchstart', e => {
            // 팔레트 드래그 중이면 이동 모드 무시
            if (touchSrc) return;

            const t = e.touches[0];
            const { x, y } = toCanvasCoords(t.clientX, t.clientY);

            activeSticker = null;
            for (let i = stickers.length - 1; i >= 0; i--) {
                const s = stickers[i];
                if (x >= s.x && x <= s.x + s.width &&
                    y >= s.y && y <= s.y + s.height) {
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
    // 7. 저장 (카카오톡 / iOS 대응)
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
                    </p>
                </body></html>
            `);
        } else {
            const link    = document.createElement('a');
            link.href     = imageData;
            link.download = 'life4cut.png';
            link.click();
        }
    });

    // ─────────────────────────────────────────
    // 시작
    // ─────────────────────────────────────────
    startCamera();
});
