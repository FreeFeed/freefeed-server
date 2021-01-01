declare module 'media-type' {
  type MediaType = {
    type: string | null;
    subtype: string | null;
    suffix: string | null;
    subtypeFacets: string[];
    parameters: { [k: string]: string };
    isValid(): boolean;
    hasSuffix(): boolean;
    isVendor(): boolean;
    isPersonal(): boolean;
    isExperimental(): boolean;
    asString(): string;
  };

  export function fromString(mediaTypeString: string): MediaType;
}
