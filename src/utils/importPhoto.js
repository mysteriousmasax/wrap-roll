export default function importPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type.startsWith('image/')) return reject(new Error('Choose an image file.'));
    if (file.size > 8 * 1024 * 1024) return reject(new Error('Photo must be smaller than 8 MB.'));

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read that photo.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Unable to process that photo.'));
      image.onload = () => {
        const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
