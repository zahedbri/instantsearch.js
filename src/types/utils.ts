export type RequiredKeys<TObject, TKeys extends keyof TObject> = TObject &
  Required<Pick<TObject, TKeys>>;
