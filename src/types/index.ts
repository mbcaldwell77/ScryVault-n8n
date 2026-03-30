export type ApiResponse<T> = {
  data: T;
};

export type ApiError = {
  error: {
    message: string;
    code: string;
  };
};

export type ApiResult<T> = ApiResponse<T> | ApiError;
