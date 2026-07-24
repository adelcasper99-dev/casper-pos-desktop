import SignupForm from "./SignupForm";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata = {
  title: "تسجيل حساب جديد - Casper ERP & POS",
  description: "إنشاء حساب تجاري جديد وتدشين متجرك خلال ثوانٍ عبر منصة Casper ERP",
};

export default async function SignupPage() {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  return <SignupForm />;
}
