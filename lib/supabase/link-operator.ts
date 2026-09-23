import "server-only";
import { createAdminClient } from "./admin";

/** On first sign-in, attach the Auth user to the operators row with the same email. */
export async function linkOperator(userId: string, email: string) {
  try {
    await createAdminClient().from("operators").update({ user_id: userId }).is("user_id", null).ilike("email", email);
  } catch (e) {
    console.error("linkOperator failed", e);
  }
}
