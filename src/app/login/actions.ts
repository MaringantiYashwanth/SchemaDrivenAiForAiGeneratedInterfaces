"use server";

import { redirect } from "next/navigation";

// Auth is currently disabled.
export async function login(_formData: FormData) {
  redirect("/");
}

// Auth is currently disabled.
export async function logout() {
  redirect("/");
}
