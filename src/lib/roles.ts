export const roleLabel = (role: string) => {
  if (role === "warehouse_manager") return "Supervisor";
  if (role === "branch_staff") return "Store officer";
  if (role === "admin") return "Store Officer Admin";
  if (role === "procurement") return "Procurement";
  return role.replace(/_/g, " ");
};

export const DEFAULT_COMPANY_NAME = "Warehouse Manager";
