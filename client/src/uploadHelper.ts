const loadImage = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
};

/**
 * Compresses an image client-side using HTML5 Canvas.
 * Rescales image dimensions so that the maximum width or height is 1200px.
 * Targets a file size between 50KB and 100KB by adjusting JPEG quality.
 */
export const compressImageClient = async (file: File): Promise<Blob> => {
  // If the file is not a compressible image format (e.g. SVG or PDF), return it as-is.
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return file;
  }

  try {
    const img = await loadImage(file);
    let { width, height } = img;
    const maxDim = 1200;

    // Preserve aspect ratio while scaling down if dimensions exceed maxDim
    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas context is not available");
    }

    // Draw the image onto the canvas
    ctx.drawImage(img, 0, 0, width, height);

    // Target sizes in bytes
    const minSize = 50 * 1024;
    const maxSize = 100 * 1024;

    let minQuality = 0.05;
    let maxQuality = 0.95;
    let quality = 0.7;
    let compressedBlob: Blob | null = null;

    // Perform up to 6 iterations of binary search for the target quality
    for (let i = 0; i < 6; i++) {
      compressedBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
      });

      if (!compressedBlob) break;

      const size = compressedBlob.size;
      if (size >= minSize && size <= maxSize) {
        break;
      } else if (size < minSize) {
        minQuality = quality;
        quality = (quality + maxQuality) / 2;
      } else {
        maxQuality = quality;
        quality = (quality + minQuality) / 2;
      }
    }

    if (!compressedBlob) {
      throw new Error("Could not compress canvas to blob");
    }

    // Post-check overrides to enforce boundaries
    if (compressedBlob.size > maxSize) {
      compressedBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.1);
      }) || compressedBlob;
    } else if (compressedBlob.size < minSize && file.size > minSize) {
      // Only force higher quality if the original file was actually larger than minSize
      compressedBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9);
      }) || compressedBlob;
    }

    return compressedBlob;
  } catch (err) {
    console.error("Client-side image compression failed, uploading original file", err);
    return file;
  }
};
