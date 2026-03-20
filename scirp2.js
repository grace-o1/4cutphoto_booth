document.addEventListener('DOMContentLoaded', () => {

    // ─────────────────────────────────────────
    // 요소 선택
    // ─────────────────────────────────────────
    const video            = document.getElementById('video');
    const captureBtn       = document.getElementById('capture-btn');
    const cameraView       = document.querySelector('.camera-view');
    const resultArea       = document.querySelector('.result-area');
    const finalPhotoCanvas = document.getElementById('final-photo-canvas');
    const saveBtn          = document.getElementById('save-final-image-btn');
    const stickerWorkspace = document.getElementById('sticker-workspace');

    // ─────────────────────────────────────────
    // 상태 변수
    // ─────────────────────────────────────────
    let capturedPhotos = [];
    const MAX_PHOTOS   = 4;
    const finalCtx     = finalPhotoCanvas.getContext('2d');
    let stickers       = [];         // 캔버스에 올라간 스티커 목록
    let activeSticker  = null;       // 터치로 이동 중인 스티커
    let offsetX = 0, offsetY = 0;   // 터치 잡은 위치 보정

    const CANVAS_W     = 400;
    const CANVAS_H     = 400;
    const STICKER_SIZE = 60;  // 스티커 크기(px) — 이 숫자만 바꾸면 됩니다

    // ─────────────────────────────────────────
    // 유틸: 캔버스 픽셀 좌표 변환
    //  → CSS 표시 크기와 실제 픽셀 크기가 다를 때 보정
    // ─────────────────────────────────────────
    function toCanvasCoords(clientX, clientY) {
        const rect   = finalPhotoCanvas.getBoundingClientRect();
        const scaleX = CANVAS_W / rect.width;
        const scaleY = CANVAS_H / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top)  * scaleY
        };
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
            video.style.transform = 'scaleX(-1)'; // 미러 반전
            video.onloadedmetadata = () => {
                video.play();
                captureBtn.disabled = false;
            };
        } catch (err) {
            console.error('카메라 오류:', err);
            alert('카메라에 접근할 수 없습니다. 권한을 확인해주세요.');
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
        console.log(`촬영 ${capturedPhotos.length}/${MAX_PHOTOS}`);

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
        cameraView.style.display  = 'none';
        captureBtn.style.display  = 'none';
        resultArea.style.display  = 'block';

        finalPhotoCanvas.width  = CANVAS_W;
        finalPhotoCanvas.height = CANVAS_H;

        // 사진 다 그린 뒤 스티커 이벤트 등록
        drawPhotosOnCanvas().then(() => {
            setupMouseDrag();   // PC 마우스
            setupTouchDrag();   // 모바일 터치
        });
    }

    // ─────────────────────────────────────────
    // 4. 4컷 사진 캔버스에 그리기
    // ─────────────────────────────────────────
    function drawPhotosOnCanvas() {
        finalCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        const cellW = CANVAS_W / 2;
        const cellH = CANVAS_H / 2;

        const promises = capturedPhotos.map((src, i) =>
            new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    finalCtx.drawImage(
                        img,
                        (i % 2) * cellW,
                        Math.floor(i / 2) * cellH,
                        cellW, cellH
                    );
                    resolve();
                };
                img.onerror = () => resolve();
                img.src = src;
            })
        );
        return Promise.all(promises);
    }

    // ─────────────────────────────────────────
    // 5. 스티커를 캔버스에 추가
    // ─────────────────────────────────────────
    function addStickerToCanvas(src, cx, cy) {
        // cx, cy = 캔버스 픽셀 좌표 (이미 변환된 값)
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

    // ─────────────────────────────────────────
    // 6. 캔버스 전체 다시 그리기 (배경 → 스티커)
    // ─────────────────────────────────────────
    function redrawFinalCanvas() {
        drawPhotosOnCanvas().then(() => {
            stickers.forEach(({ img, x, y, width, height }) => {
                finalCtx.drawImage(img, x, y, width, height);
            });
        });
    }

    // ─────────────────────────────────────────
    // 7-A. PC 마우스 드래그
    //   팔레트 스티커를 마우스로 캔버스에 드래그&드롭
    // ─────────────────────────────────────────
    function setupMouseDrag() {
        let draggingSrc = null;

        // ① 팔레트 스티커 — 마우스 누를 때 src 저장
        // [FIX] "movedown" → "mousedown"
        document.querySelectorAll('.sticker-item').forEach(item => {
            item.addEventListener('mousedown', () => {
                draggingSrc = item.src;
            });

            // HTML drag & drop API 병행 지원
            item.addEventListener('dragstart', (e) => {
                draggingSrc = item.src;
                e.dataTransfer.setData('text/plain', item.src);
                e.dataTransfer.effectAllowed = 'copy';
            });
        });

        // ② 캔버스 위에서 마우스 떼면 → 스티커 추가
        // [FIX] "moveup" → "mouseup"
        stickerWorkspace.addEventListener('mouseup', (e) => {
            if (!draggingSrc) return;
            const { x, y } = toCanvasCoords(e.clientX, e.clientY);
            addStickerToCanvas(draggingSrc, x, y);
            draggingSrc = null;
        });

        // ③ HTML drag & drop API drop 이벤트
        stickerWorkspace.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });

        stickerWorkspace.addEventListener('drop', (e) => {
            e.preventDefault();
            const src = e.dataTransfer.getData('text/plain') || draggingSrc;
            if (!src) return;
            const { x, y } = toCanvasCoords(e.clientX, e.clientY);
            addStickerToCanvas(src, x, y);
            draggingSrc = null;
        });

        // ④ 캔버스 밖에서 마우스 떼도 초기화
        document.addEventListener('mouseup', () => { draggingSrc = null; });
    }

    // ─────────────────────────────────────────
    // 7-B. 모바일 터치
    //   팔레트 스티커 터치 → 캔버스 드롭 / 캔버스 위 스티커 이동
    // ─────────────────────────────────────────
    function setupTouchDrag() {

        let touchSrc = null; // 팔레트에서 선택한 스티커 src

        // ── 팔레트 스티커 터치 ──
        document.querySelectorAll('.sticker-item').forEach(item => {
            item.addEventListener('touchstart', (e) => {
                e.preventDefault(); // 팔레트 스크롤 방지
                touchSrc = item.src;
            }, { passive: false });

            item.addEventListener('touchend', (e) => {
                if (!touchSrc) return;
                const touch = e.changedTouches[0];
                // 손가락 뗀 위치가 캔버스 위인지 확인
                const rect = finalPhotoCanvas.getBoundingClientRect();
                if (
                    touch.clientX >= rect.left && touch.clientX <= rect.right &&
                    touch.clientY >= rect.top  && touch.clientY <= rect.bottom
                ) {
                    const { x, y } = toCanvasCoords(touch.clientX, touch.clientY);
                    addStickerToCanvas(touchSrc, x, y);
                }
                touchSrc = null;
            }, { passive: false });
        });

        // ── 캔버스 위 기존 스티커 이동 ──

        // [FIX] passive: false 여야 e.preventDefault() 가 동작
        document.addEventListener('touchmove', (e) => {
            if (e.target.closest('#sticker-workspace')) {
                e.preventDefault(); // 카카오톡 스크롤 방지
            }
        }, { passive: false });

        stickerWorkspace.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            const { x, y } = toCanvasCoords(touch.clientX, touch.clientY);

            activeSticker = null;
            // 위에 있는 스티커(마지막 추가된 것)부터 검사
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

        // [FIX] touchmove를 touchstart 안이 아니라 밖에 등록
        //        → 안에 등록하면 touchstart 때마다 이벤트가 중복 누적됨!
        stickerWorkspace.addEventListener('touchmove', (e) => {
            if (!activeSticker) return;
            e.preventDefault();
            const touch = e.touches[0];
            const { x, y } = toCanvasCoords(touch.clientX, touch.clientY);
            activeSticker.x = x - offsetX;
            activeSticker.y = y - offsetY;
            redrawFinalCanvas();
        }, { passive: false });

        stickerWorkspace.addEventListener('touchend', () => {
            activeSticker = null;
        });
    }

    // ─────────────────────────────────────────
    // 8. 저장 (카카오톡 / iOS 대응)
    // ─────────────────────────────────────────
    saveBtn.addEventListener('click', async () => {
        await drawPhotosOnCanvas();
        stickers.forEach(({ img, x, y, width, height }) => {
            finalCtx.drawImage(img, x, y, width, height);
        });

        const imageData = finalPhotoCanvas.toDataURL('image/png');
        const newTab    = window.open();
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
            // 팝업 차단 시 fallback
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
