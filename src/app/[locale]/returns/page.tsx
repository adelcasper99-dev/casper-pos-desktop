import ReturnsCenterClient from "./ReturnsCenterClient";
import { getCSRFToken } from "@/lib/csrf";
import { getStoreSettings } from "@/actions/settings";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ReturnsCenterPage() {
  const csrfToken = await getCSRFToken();
  const settingsRes = await getStoreSettings();
  const settings = (settingsRes?.data || {}) as { features?: string };

  let features: Record<string, boolean> = {};
  try {
    features = JSON.parse(typeof settings.features === "string" ? settings.features : "{}");
  } catch (e) {
    console.error("Failed to parse features", e);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">مركز المرتجعات الموحد</h1>
        <p className="text-zinc-400 mt-1">
          إدارة مرتجعات المبيعات، المشتريات، وتذاكر الصيانة من مكان واحد
        </p>
      </div>
      <ReturnsCenterClient csrfToken={csrfToken || ""} features={features} />
    </div>
  );
}
