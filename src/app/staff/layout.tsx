import { requireRole } from '@/lib/auth/session';

export default async function StaffLayout({ children }: LayoutProps<'/staff'>) {
  await requireRole(['staff', 'admin']);
  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">{children}</div>
  );
}
