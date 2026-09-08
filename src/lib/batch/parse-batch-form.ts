// 梯次表單解析：admin 和 staff 建立/編輯梯次的 server action 共用同一份解析
// 邏輯，見 src/app/admin/batches/actions.ts。

export type BatchInput = {
  name: string;
  description: string | null;
  startAt: Date;
  endAt: Date | null;
  instructorName: string | null;
  courseCode: string | null;
  courseType: 'required' | 'elective' | null;
  location: string | null;
  classSchedule: string | null;
};

export function parseBatchForm(
  formData: FormData,
): BatchInput | { error: string } {
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const startAtRaw = String(formData.get('startAt') ?? '');
  const noEndDate = formData.get('noEndDate') === 'on';
  const endAtRaw = String(formData.get('endAt') ?? '');
  const instructorName = String(formData.get('instructorName') ?? '').trim();
  const courseCode = String(formData.get('courseCode') ?? '').trim();
  const courseTypeRaw = String(formData.get('courseType') ?? '');
  const courseType =
    courseTypeRaw === 'required' || courseTypeRaw === 'elective'
      ? courseTypeRaw
      : null;
  const location = String(formData.get('location') ?? '').trim();
  const classSchedule = String(formData.get('classSchedule') ?? '').trim();

  if (!name) return { error: '請輸入梯次名稱' };
  const startAt = new Date(startAtRaw);
  if (Number.isNaN(startAt.getTime())) {
    return { error: '請輸入有效的開始時間' };
  }

  let endAt: Date | null = null;
  if (!noEndDate) {
    endAt = new Date(endAtRaw);
    if (Number.isNaN(endAt.getTime())) {
      return { error: '請輸入有效的結束時間，或勾選「不設結束時間」' };
    }
    if (endAt <= startAt) return { error: '結束時間必須晚於開始時間' };
  }

  return {
    name,
    description: description || null,
    startAt,
    endAt,
    instructorName: instructorName || null,
    courseCode: courseCode || null,
    courseType,
    location: location || null,
    classSchedule: classSchedule || null,
  };
}
