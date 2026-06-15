/**
 * Compresses an image file using HTML Canvas to reduce its size for secure storage.
 * If file is already below targetSizeKB, it returns the original base64.
 * Otherwise, it scales and compresses the image down.
 */
export function compressImageToBase64(
  file: File,
  targetSizeKB: number = 200,
  maxWidthOrHeight: number = 800
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        // Calculate new dimensions
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidthOrHeight || height > maxWidthOrHeight) {
          if (width > height) {
            height = Math.round((height * maxWidthOrHeight) / width);
            width = maxWidthOrHeight;
          } else {
            width = Math.round((width * maxWidthOrHeight) / height);
            height = maxWidthOrHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(img.src); // fallback to original on error
          return;
        }

        // Draw image onto canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Compress image using quality slider
        let quality = 0.8;
        let base64Result = canvas.toDataURL('image/jpeg', quality);

        // Keep compressing if result exceeds target size in KB (approximated size of base64 matches length * 0.75)
        while ((base64Result.length * 0.75) / 1024 > targetSizeKB && quality > 0.2) {
          quality -= 0.1;
          base64Result = canvas.toDataURL('image/jpeg', quality);
        }

        resolve(base64Result);
      };
      img.onerror = (e) => {
        reject(e);
      };
    };
    reader.onerror = (e) => reject(e);
  });
}

/**
 * Cropping a 3x3 custom avatar collage sheet into exactly 9 square avatar blocks.
 */
export function slice3x3GridToAvatars(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        if (size <= 0) {
          resolve([]);
          return;
        }
        const cellW = size / 3;
        const cellH = size / 3;
        const results: string[] = [];
        
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            const canvas = document.createElement('canvas');
            canvas.width = 150;
            canvas.height = 150;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              // Ensure coordinates and size are rounded and strictly clamped within img dimensions
              // to prevent "The string did not match the expected pattern." errors on Safari / WebKit.
              const sx = Math.max(0, Math.min(img.width - 1, Math.floor(c * cellW)));
              const sy = Math.max(0, Math.min(img.height - 1, Math.floor(r * cellH)));
              const sw = Math.max(1, Math.min(img.width - sx, Math.floor(cellW)));
              const sh = Math.max(1, Math.min(img.height - sy, Math.floor(cellH)));
              ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 150, 150);
              results.push(canvas.toDataURL('image/jpeg', 0.85));
            }
          }
        }
        resolve(results);
      };
      img.onerror = (e) => reject(e);
    };
    reader.onerror = (e) => reject(e);
  });
}

