document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('video');
    const captureBtn = document.getElementById('capture-btn');
    const cameraView = document.querySelector('.camera-view');
    const resultArea = document.querySelector('.result-area');
    const finalPhotoCanvas = document.getElementById('final-photo-canvas');
    const saveBtn = document.getElementById('save-final-image-btn');
    const stickerWorkspace = document.getElementById('sticker-workspace');
    
    let capturedPhotos = [];
    const MAX_PHOTOS = 4;
    let finalCtx = finalPhotoCanvas.getContext('2d');
    let stickers = [];
    let activeSticker = null; //현재 잡고 있는스티커
    let offsetX = 0; //내부 잡은 위치 보정xy
    let offsetY = 0;

    //캔버스 크기 고정
    const CANVAS_W = 400;
    const CANVAS_H = 700;

    const stickerSize = 50;

    // ─────────────────────────────────────────
    // 1. 웹캠 시작
    // ─────────────────────────────────────────
    async function startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    // width: 280,
                    // height: 680,
                    facingMode: 'user',
                    aspectRatio: 9/16
                }
            });
            video.srcObject = stream;

            // [FIX] 전면 카메라 좌우 미러 반전 (CSS transform)
            video.style.transform = 'scaleX(-1)';

            video.onloadedmetadata = () => {
                video.play();
                captureBtn.disabled = false;
            };
        } catch (err) {
            console.error("카메라 접근 오류: - scirp2.js:37", err);
            alert("카메라에 접근할 수 없습니다. 권한을 확인해주세요.");
        }
    }
    
    // ─────────────────────────────────────────
    // 2. 사진 찍기
    // ─────────────────────────────────────────
    captureBtn.addEventListener('click', () => {
        if (capturedPhotos.length >= MAX_PHOTOS) return;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // [FIX] 전면 카메라 좌우 반전을 캔버스에도 적용
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const photoDataUrl = canvas.toDataURL('image/png');
        capturedPhotos.push(photoDataUrl);

        console.log(`사진 촬영 완료: ${capturedPhotos.length}/${MAX_PHOTOS} - scirp2.js:61`);

        if (capturedPhotos.length < MAX_PHOTOS) {
            captureBtn.textContent = `사진찍기 ${capturedPhotos.length + 1}/${MAX_PHOTOS}`;
        } else {
            captureBtn.textContent = '촬영 완료! 편집 시작';
            captureBtn.disabled = true;
            switchToEditMode();
        };
    });

    // ─────────────────────────────────────────
    // 3. 편집 모드 전환
    // ─────────────────────────────────────────
    function switchToEditMode() {
        cameraView.style.display = 'none';
        captureBtn.style.display = 'none';
        resultArea.style.display = 'block';

        finalPhotoCanvas.width = CANVAS_W;
        finalPhotoCanvas.height = CANVAS_H;

        // [FIX] 비동기 사진 로드 완료 후 스티커 드래그 설정
        drawPhotosOnCanvas().then(() => {
        });

        setupStickerDragDrop();
        setupMobileStickerDrag();
        MobileStickerMove();
    };

    // ─────────────────────────────────────────
    // 4. 4컷 사진 캔버스에 그리기 (Promise 반환)
    // [FIX] 모든 이미지 로드를 Promise.all로 처리해 순서 보장
    // ─────────────────────────────────────────
    async function drawPhotosOnCanvas() {
        finalCtx.clearRect(0, 0, finalPhotoCanvas.width, finalPhotoCanvas.height);

        const imgWidth = finalPhotoCanvas.width / 2;
        const imgHeight = finalPhotoCanvas.height / 2;

        const drawPromises = capturedPhotos.map((src, index) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const x = (index % 2) * imgWidth;
                    const y = Math.floor(index / 2) * imgHeight;
                    finalCtx.drawImage(img, x, y, imgWidth, imgHeight);
                    resolve();
                };
                img.src = src;
            });
        });

        return Promise.all(drawPromises);
    }

    // ─────────────────────────────────────────
    // 5. 스티커 드래그 앤 드롭
    // ─────────────────────────────────────────
    function setupStickerDragDrop() {
        let stickerItems = document.querySelectorAll('.sticker-item');
        stickerItems.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', e.target.src);
                e.dataTransfer.effectAllowed = 'copy';
            });
        });

        stickerWorkspace.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });

        stickerWorkspace.addEventListener('drop', (e) => {
            e.preventDefault();
            const imgSrc = e.dataTransfer.getData('text/plain');

            const rect = finalPhotoCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            addStickerToCanvas(imgSrc, x, y);
        });
    }

    function setupMobileStickerDrag() {

    const stickerItems = document.querySelectorAll('.sticker-item');

    stickerItems.forEach(item => {

        item.addEventListener("touchstart", (e) => {
            touchDraggingSticker = item.src;
            e.isTrusted();
        });

        item.addEventListener("touchmove", (e) => {
            e.preventDefault();
        });

        item.addEventListener("touchend", (e) => {

            if (!touchDraggingSticker) return;

            const touch = e.changedTouches[0];
            const rect = finalPhotoCanvas.getBoundingClientRect();

            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            // 캔버스 영역 안에 드롭했을 때만
            if (
                x >= 0 &&
                x <= rect.width &&
                y >= 0 &&
                y <= rect.height
            ) {
                addStickerToCanvas(touchDraggingSticker, x, y);
            }

            // touchDraggingSticker = null;
            touchDraggingSticker = addStickerToCanvas();

        });

    });

}

    function addStickerToCanvas(src, x, y) {
        const img = new Image();
        img.onload = () => {

            const size = stickerSize;

            // stickers.push({ img, x: x - img.width / 2, y: y - img.height / 2 , width: img.width, height: img.height});
            stickers.push({ img, x: x - size / 2, y: y - size / 2 , width: size, height: size});

            // [FIX] 사진 다시 그린 뒤 스티커 그리기를 순서 보장
            redrawFinalCanvas();
        };
        img.src = src;
    }

    //  ─────────────────────────────────────────
    // 5-1. 모바일 스티커 이동 함수 추가
    function MobileStickerMove(){
        stickerWorkspace.addEventListener("touchstart", (e) => {
            const rect = finalPhotoCanvas.getBoundingClientRect();
            const touch = e.touches[0];

            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
        })
    }

    stickerWorkspace.addEventListener("touchmove", (e) => {
        if(!activeSticker) return;
        e.preventDefault();

        const rect = finalPhotoCanvas.getBoundingClientRect();
        const touch = e.touches[0];

        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        activeSticker.x = x - offsetX;
        activeSticker.y = y - offsetY;

        redrawFinalCanvas();
    });

    stickerWorkspace.addEventListener("touchend", () => {
        activeSticker = null;
    });

    // [FIX] 배경 사진 로드 완료 후 스티커 그리기
    function redrawFinalCanvas() {
        drawPhotosOnCanvas().then(() => {
            stickers.forEach(sticker => {
                finalCtx.drawImage(sticker.img, sticker.x, sticker.y, sticker.width, sticker.height);
            });
        });
    }

    // ─────────────────────────────────────────
    // 6. 최종 이미지 저장
    // [FIX] 저장 전 최종 상태 한 번 더 렌더링 후 다운로드
    // ─────────────────────────────────────────
    saveBtn.addEventListener('click', async () => {

        // console.log("저장버튼클릭됨")

        await drawPhotosOnCanvas();

        stickers.forEach(sticker => {
            finalCtx.drawImage(
                sticker.img,
                sticker.x,
                sticker.y,
                sticker.width,
                sticker.height
            );
        })

        // drawPhotosOnCanvas().then(() => {
        //     stickers.forEach(sticker => {
        //         finalCtx.drawImage(sticker.img, sticker.x, sticker.y, sticker.width, sticker.height);
        //     });

            const image = finalPhotoCanvas
                .toDataURL('image/jpeg')
                .replace('image/jpeg', 'image/octet-stream');

          setTimeout(() => {      
            const link = document.createElement('a');
            link.download = 'life-4cut-photo.jpeg';
            link.href = image;
            link.click();
            }, 100);
        });

    // ─────────────────────────────────────────
    // 시작
    // ─────────────────────────────────────────
    startCamera();
});
