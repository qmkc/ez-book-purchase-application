'use client';

import { useRef, useState } from 'react';

import {
  ALLOWED_COVER_IMAGE_TYPES,
  MAX_COVER_IMAGE_BYTES,
} from '@/lib/book/book-cover-constants';

export function CoverImageInput({
  previewUrl,
  onFileSelected,
  hasExistingCover,
  removeCoverImage,
  onRemoveChange,
  fileInputRef,
}: {
  previewUrl: string | null;
  onFileSelected: (file: File) => void;
  hasExistingCover: boolean;
  removeCoverImage: boolean;
  onRemoveChange: (checked: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);

  function acceptFile(file: File) {
    if (!ALLOWED_COVER_IMAGE_TYPES.includes(file.type)) {
      setLocalError('僅支援 JPEG、PNG、WebP、GIF 格式');
      return;
    }
    if (file.size > MAX_COVER_IMAGE_BYTES) {
      setLocalError(`檔案過大，上限 ${MAX_COVER_IMAGE_BYTES / 1024 / 1024}MB`);
      return;
    }
    setLocalError(null);

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    if (fileInputRef.current) fileInputRef.current.files = dataTransfer.files;

    onFileSelected(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) acceptFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) acceptFile(file);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const item = Array.from(e.clipboardData.items).find((i) =>
      i.type.startsWith('image/'),
    );
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    acceptFile(file);
  }

  return (
    <div className="flex flex-wrap items-start gap-4">
      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt="封面預覽"
          className="h-32 w-24 rounded-md border border-black/10 object-cover dark:border-white/15"
        />
      )}
      <div className="flex flex-1 flex-col gap-2">
        <div
          ref={dropzoneRef}
          tabIndex={0}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onPaste={handlePaste}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed px-3 py-4 text-center text-xs outline-none transition-colors ${
            isDragOver
              ? 'border-black/40 bg-black/4 dark:border-white/50 dark:bg-white/6'
              : 'border-black/20 text-zinc-500 focus:border-black/40 dark:border-white/25 dark:focus:border-white/50'
          }`}
        >
          <span>點擊選擇檔案、拖拉圖片到這裡，或點擊後貼上剪貼簿圖片</span>
          <span className="text-zinc-400">
            JPEG / PNG / WebP / GIF，上限 5MB
          </span>
          <input
            ref={fileInputRef}
            name="coverImageFile"
            type="file"
            accept={ALLOWED_COVER_IMAGE_TYPES.join(',')}
            onChange={handleInputChange}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 text-xs"
          />
        </div>
        {localError && (
          <p className="text-xs text-red-600 dark:text-red-400">{localError}</p>
        )}
        {hasExistingCover && (
          <label className="flex items-center gap-1.5 text-xs text-zinc-500">
            <input
              type="checkbox"
              name="removeCoverImage"
              checked={removeCoverImage}
              onChange={(e) => onRemoveChange(e.target.checked)}
            />
            移除封面圖片
          </label>
        )}
      </div>
    </div>
  );
}
