import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';

const MAX_DIMENSION = 256;

function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that image'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read that image'));
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function EditProfileModal({ isOpen, onClose, currentUser, onSave }) {
  const [name, setName] = useState(currentUser?.name || '');
  const [avatarPreview, setAvatarPreview] = useState(currentUser?.avatar || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const isImageAvatar = (value) => typeof value === 'string' && value.startsWith('data:image');

  const handleClose = () => {
    setName(currentUser?.name || '');
    setAvatarPreview(currentUser?.avatar || '');
    setError('');
    onClose();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    try {
      setError('');
      const dataUrl = await resizeImageFile(file);
      setAvatarPreview(dataUrl);
    } catch {
      setError('Could not read that image. Try a different file.');
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ name: name.trim(), avatar: isImageAvatar(avatarPreview) ? avatarPreview : undefined });
      onClose();
    } catch (err) {
      setError(err.message || 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const initials = currentUser?.name?.split(' ').map((part) => part[0]).join('').slice(0, 2);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Edit profile" size="sm">
      <div className="flex flex-col items-center gap-3 pb-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="group relative h-24 w-24 rounded-full"
          aria-label="Upload profile photo"
        >
          {isImageAvatar(avatarPreview) ? (
            <img src={avatarPreview} alt="" className="h-24 w-24 rounded-full object-cover ring-2 ring-white shadow-sm" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-secondary-container text-2xl font-display font-extrabold text-secondary ring-2 ring-white shadow-sm">
              {initials}
            </div>
          )}
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
            <Camera size={20} />
          </span>
        </button>
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFileChange} />
        <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs font-semibold text-primary hover:underline">
          Change photo
        </button>
      </div>

      <div className="space-y-4">
        <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} />
        {error && <p className="text-xs text-error">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Button variant="ghost" className="flex-1" onClick={handleClose} disabled={saving}>Cancel</Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</Button>
        </div>
      </div>
    </Modal>
  );
}
