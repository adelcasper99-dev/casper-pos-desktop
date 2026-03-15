import ReturnsCenterClient from "./ReturnsCenterClient";
import { getCSRFToken } from "@/lib/csrf";

export const dynamic = "force-dynamic";

export default async function ReturnsCenterPage() {
  const csrfToken = await getCSRFToken();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">مركز المرتجعات الموحد</h1>
        <p className="text-zinc-400 mt-1">
          إدارة مرتجعات المبيعات، المشتريات، وتذاكر الصيانة من مكان واحد
        </p>
      </div>
      <ReturnsCenterClient csrfToken={csrfToken || ""} />
    </div>
  );
}
