import type { User } from "@supabase/supabase-js";

export const getUserAvatarUrl = (user: User | null) => {
  if (!user) return null;

  const avatar = user.user_metadata?.avatar_url;
  if (typeof avatar === "string" && avatar.length > 0) {
    return avatar;
  }

  const picture = user.user_metadata?.picture;
  if (typeof picture === "string" && picture.length > 0) {
    return picture;
  }

  return null;
};

export const getUserDisplayName = (user: User | null) => {
  if (!user) return "BioSync User";

  const fullName = user.user_metadata?.full_name;
  if (typeof fullName === "string" && fullName.length > 0) {
    return fullName;
  }

  const name = user.user_metadata?.name;
  if (typeof name === "string" && name.length > 0) {
    return name;
  }

  const emailPrefix = user.email?.split("@")[0];
  return emailPrefix && emailPrefix.length > 0 ? emailPrefix : "BioSync User";
};
