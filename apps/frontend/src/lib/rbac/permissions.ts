export const hasPermission = (permissions: string[], required?: string | string[]) => {
  if (!required) return true;
  const requiredList = Array.isArray(required) ? required : [required];
  return requiredList.every((permission) => permissions.includes(permission));
};
