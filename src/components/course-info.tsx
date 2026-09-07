const COURSE_TYPE_LABEL: Record<string, string> = {
  required: '必修',
  elective: '選修',
};

type Batch = {
  instructorName: string | null;
  courseCode: string | null;
  courseType: string | null;
  location: string | null;
  classSchedule: string | null;
};

// 梯次對應的課程資訊，全部都是選填欄位，一個都沒填就不顯示這個區塊。
export function CourseInfo({ batch }: { batch: Batch }) {
  const hasCourseInfo =
    batch.instructorName ||
    batch.courseCode ||
    batch.courseType ||
    batch.location ||
    batch.classSchedule;
  if (!hasCourseInfo) return null;

  const lines = [
    batch.instructorName && `授課老師：${batch.instructorName}`,
    batch.courseCode && `課號：${batch.courseCode}`,
    batch.courseType && COURSE_TYPE_LABEL[batch.courseType],
    batch.classSchedule && `上課時間：${batch.classSchedule}`,
    batch.location && `上課地點：${batch.location}`,
  ].filter(Boolean);

  return (
    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
      {lines.join(' · ')}
    </p>
  );
}
