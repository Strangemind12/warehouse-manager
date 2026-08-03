import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_COMPANY_NAME } from "@/lib/roles";

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const [{ data: profile }, { data: roles }, { data: company }] = await Promise.all([
        supabase.from("profiles").select("*, branch:branches(id,name,is_warehouse)").eq("id", auth.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", auth.user.id),
        (supabase as any).from("company_settings").select("*").eq("owner_id", auth.user.id).maybeSingle(),
      ]);
      const roleList = (roles ?? []).map(r => r.role);
      return {
        id: auth.user.id,
        email: auth.user.email,
        profile,
        company,
        companyName: company?.company_name || DEFAULT_COMPANY_NAME,
        roles: roleList,
        isAdmin: roleList.includes("admin"),
        isWarehouseManager: roleList.includes("warehouse_manager") || roleList.includes("admin"),
        isBranchStaff: roleList.includes("branch_staff") || roleList.includes("warehouse_manager") || roleList.includes("admin"),
        isProcurement: roleList.includes("procurement"),
      };
    },
    staleTime: 30_000,
  });
}
