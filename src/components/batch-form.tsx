'use client';

import { Checkbox, FormControlLabel, MenuItem, TextField } from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import dayjs, { Dayjs } from 'dayjs';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

const inputClass =
  'rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50';

type BatchFormState = { error?: string; success?: boolean };
type BatchFormAction = (
  prevState: BatchFormState | undefined,
  formData: FormData,
) => Promise<BatchFormState>;

type BatchDefaults = {
  name?: string;
  description?: string | null;
  startAt?: Date;
  endAt?: Date | null;
  instructorName?: string | null;
  courseCode?: string | null;
  courseType?: string | null;
  location?: string | null;
  classSchedule?: string | null;
};

export function BatchForm({
  action,
  defaults,
  submitLabel,
}: {
  action: BatchFormAction;
  defaults?: BatchDefaults;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const router = useRouter();

  const [name, setName] = useState(defaults?.name ?? '');
  const [description, setDescription] = useState(defaults?.description ?? '');
  const [startAt, setStartAt] = useState<Dayjs | null>(
    defaults?.startAt ? dayjs(defaults.startAt) : null,
  );
  const [endAt, setEndAt] = useState<Dayjs | null>(
    defaults?.endAt ? dayjs(defaults.endAt) : null,
  );
  const [noEndDate, setNoEndDate] = useState(
    defaults ? !defaults.endAt : false,
  );
  const [instructorName, setInstructorName] = useState(
    defaults?.instructorName ?? '',
  );
  const [courseCode, setCourseCode] = useState(defaults?.courseCode ?? '');
  const [courseType, setCourseType] = useState(defaults?.courseType ?? '');
  const [classSchedule, setClassSchedule] = useState(
    defaults?.classSchedule ?? '',
  );
  const [location, setLocation] = useState(defaults?.location ?? '');
  const [startPickerOpen, setStartPickerOpen] = useState(false);
  const [endPickerOpen, setEndPickerOpen] = useState(false);

  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!defaults) startTransition(() => setStartAt(dayjs()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state?.success) router.refresh();
  }, [state?.success, router]);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        梯次名稱 *
        <input
          name="name"
          required
          placeholder="例如：2026 秋季教科書團購"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        說明
        <textarea
          name="description"
          rows={3}
          value={description ?? ''}
          onChange={(e) => setDescription(e.target.value)}
          className={inputClass}
        />
      </label>

      <div className="flex flex-col gap-1 text-sm">
        開始時間 *
        <DateTimePicker
          value={startAt}
          onChange={setStartAt}
          ampm={false}
          open={startPickerOpen}
          onOpen={() => setStartPickerOpen(true)}
          onClose={() => setStartPickerOpen(false)}
          slotProps={{
            textField: {
              size: 'small',
              onClick: () => setStartPickerOpen(true),
            },
            field: { readOnly: true },
          }}
        />
        <input
          type="hidden"
          name="startAt"
          value={startAt?.toISOString() ?? ''}
        />
      </div>

      <div className="flex flex-col gap-1 text-sm">
        <div className="flex items-center justify-between">
          <span>結束時間{noEndDate ? '' : ' *'}</span>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={noEndDate}
                onChange={(e) => setNoEndDate(e.target.checked)}
              />
            }
            label="不設結束時間（長期開放）"
            slotProps={{
              typography: { sx: { fontSize: 12, color: 'text.secondary' } },
            }}
          />
        </div>
        <DateTimePicker
          value={endAt}
          onChange={setEndAt}
          ampm={false}
          disabled={noEndDate}
          open={endPickerOpen}
          onOpen={() => setEndPickerOpen(true)}
          onClose={() => setEndPickerOpen(false)}
          slotProps={{
            textField: { size: 'small', onClick: () => setEndPickerOpen(true) },
            field: { readOnly: true },
          }}
        />
        <input
          type="hidden"
          name="endAt"
          value={noEndDate ? '' : (endAt?.toISOString() ?? '')}
        />
        {noEndDate && <input type="hidden" name="noEndDate" value="on" />}
      </div>

      <div className="mt-2 border-t border-black/10 pt-4 dark:border-white/15">
        <p className="mb-3 text-sm font-medium">課程資訊（選填）</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            授課老師
            <input
              name="instructorName"
              placeholder="例如：阮炳嵐"
              value={instructorName ?? ''}
              onChange={(e) => setInstructorName(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            課號
            <input
              name="courseCode"
              placeholder="例如：1918"
              value={courseCode ?? ''}
              onChange={(e) => setCourseCode(e.target.value)}
              className={inputClass}
            />
          </label>
          <div className="flex flex-col gap-1 text-sm">
            修別
            <TextField
              select
              size="small"
              value={courseType ?? ''}
              onChange={(e) => setCourseType(e.target.value)}
            >
              <MenuItem value="">未分類</MenuItem>
              <MenuItem value="required">必修</MenuItem>
              <MenuItem value="elective">選修</MenuItem>
            </TextField>
            <input type="hidden" name="courseType" value={courseType ?? ''} />
          </div>
          <label className="flex flex-col gap-1 text-sm">
            上課時間
            <input
              name="classSchedule"
              placeholder="例如：禮拜四 2,3,4 節"
              value={classSchedule ?? ''}
              onChange={(e) => setClassSchedule(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            上課地點
            <input
              name="location"
              placeholder="例如：文理及管理大樓 B1 CMAB102 階梯教室"
              value={location ?? ''}
              onChange={(e) => setLocation(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
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
