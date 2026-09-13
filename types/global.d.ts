declare global {
  const B64Assets: Record<string, Base64String>;
}

export {};
export type Base64String = string & { __base64: never }; // Custom type to indicate base64 strings
