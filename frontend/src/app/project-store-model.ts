export interface ProjectAsset { _id: string; name: string; kind: string; size: number; sha256: string }
export interface ProjectFirmware { name: string; chip: string; format: 'MERGED' | 'PARTS'; parts: { assetId: string; address: number }[] }
export interface StoreProject { _id: string; name: string; description: string; instructions?: string; active: boolean; images: string[]; pdfs?: string[]; videoUrl?: string; digitalPrice: number; completeEnabled: boolean; completePrice: number; stock: number; packagingId?: string; weightGrams?: number; digitalProductId: string; completeProductId: string; firmware?: ProjectFirmware[]; assets?: ProjectAsset[]; owned?: boolean }
export const ESP_CHIPS = ['ESP32', 'ESP32-S2', 'ESP32-S3', 'ESP32-C3', 'ESP32-C6'];
