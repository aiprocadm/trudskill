type ToastFn = (title: string, message?: string) => void;

let successImpl: ToastFn | null = null;
let errorImpl: ToastFn | null = null;

export const registerSuccessToast = (fn: ToastFn) => {
  successImpl = fn;
  return () => {
    successImpl = null;
  };
};

export const registerErrorToast = (fn: ToastFn) => {
  errorImpl = fn;
  return () => {
    errorImpl = null;
  };
};

export const pushGlobalSuccessToast = (title: string, message?: string) => {
  successImpl?.(title, message);
};

export const pushGlobalErrorToast = (title: string, message?: string) => {
  errorImpl?.(title, message);
};
