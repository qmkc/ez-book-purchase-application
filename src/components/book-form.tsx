'use client';

import { useRouter } from 'next/navigation';
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';

import { CoverImageInput } from './cover-image-input';

type BookFormState = { error?: string; success?: boolean };
type BookFormAction = (
  prevState: BookFormState | undefined,
  formData: FormData,
) => Promise<BookFormState>;

type BookDefaults = {
  title?: string;
  isbn?: string | null;
  author?: string | null;
  publisher?: string | null;
  coverImageUrl?: string | null;
  description?: string | null;
  listPrice?: number;
  subject?: string | null;
  gradeLevel?: string | null;
};

const inputClass =
  'rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50';

export function BookForm({
  action,
  defaults,
  submitLabel,
}: {
  action: BookFormAction;
  defaults?: BookDefaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const router = useRouter();

  const [title, setTitle] = useState(defaults?.title ?? '');
  const [listPrice, setListPrice] = useState(
    defaults?.listPrice?.toString() ?? '',
  );
  const [isbn, setIsbn] = useState(defaults?.isbn ?? '');
  const [author, setAuthor] = useState(defaults?.author ?? '');
  const [publisher, setPublisher] = useState(defaults?.publisher ?? '');
  const [subject, setSubject] = useState(defaults?.subject ?? '');
  const [gradeLevel, setGradeLevel] = useState(defaults?.gradeLevel ?? '');
  const [description, setDescription] = useState(defaults?.description ?? '');
  const [coverImageUrl, setCoverImageUrl] = useState(
    defaults?.coverImageUrl ?? '',
  );
  const [removeCoverImage, setRemoveCoverImage] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  function handleFileSelected(file: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setRemoveCoverImage(false);
  }

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!state?.success) return;
    startTransition(() => {
      setRemoveCoverImage(false);
      setPreviewUrl(null);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
    router.refresh();
  }, [state?.success, router]);

  const displayedCoverUrl =
    previewUrl ?? (removeCoverImage ? null : defaults?.coverImageUrl);

  return (
    <form
      action={formAction}
      encType="multipart/form-data"
      className="flex flex-col gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          書名 *
          <input
            name="title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          建議售價（新台幣）*
          <input
            name="listPrice"
            type="number"
            min={0}
            required
            value={listPrice}
            onChange={(e) => setListPrice(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          ISBN
          <input
            name="isbn"
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          作者
          <input
            name="author"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          出版社
          <input
            name="publisher"
            value={publisher}
            onChange={(e) => setPublisher(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          適用科目
          <input
            name="subject"
            placeholder="例如：微積分"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          適用年級
          <input
            name="gradeLevel"
            placeholder="例如：大一"
            value={gradeLevel}
            onChange={(e) => setGradeLevel(e.target.value)}
            className={inputClass}
          />
        </label>

        <div className="flex flex-col gap-2 text-sm sm:col-span-2">
          封面圖片
          <CoverImageInput
            previewUrl={displayedCoverUrl ?? null}
            onFileSelected={handleFileSelected}
            hasExistingCover={Boolean(defaults?.coverImageUrl)}
            removeCoverImage={removeCoverImage}
            onRemoveChange={(checked) => {
              setRemoveCoverImage(checked);
              if (checked) {
                setPreviewUrl(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }
            }}
            fileInputRef={fileInputRef}
          />
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            或使用外部圖片網址
            <input
              name="coverImageUrl"
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          簡介
          <textarea
            name="description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      {state?.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-sm text-green-700 dark:text-green-400">已儲存</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {pending ? '儲存中…' : submitLabel}
      </button>
    </form>
  );
}
