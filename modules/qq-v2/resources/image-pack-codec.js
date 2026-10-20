import { t } from '../../i18n/index.js';

const MAX_RESOURCE_BYTES = 8 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_RESOURCE_BYTES / 3) * 4;

export function requireImageMimeType(value, label) {
    const mimeType = String(value ?? '').trim().slice(0, 128).toLowerCase();
    if (!/^image\/[a-z0-9.+-]+$/u.test(mimeType)) throw new Error(t`${label}的图片类型无效`);
    return mimeType;
}

export function requireDataUrl(value, mimeType, label) {
    const dataUrl = String(value ?? '').trim();
    if (!dataUrl.startsWith(`data:${mimeType};base64,`)) throw new Error(t`${label}的图片数据无效`);
    return dataUrl;
}

export function dataUrlToBlob(dataUrl, mimeType) {
    const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1);
    if (encoded.length > MAX_BASE64_LENGTH) throw new Error(t("单张图片不能超过 8MB"));
    let binary;
    try {
        binary = atob(encoded);
    } catch {
        throw new Error(t("图片数据不是有效的 Base64"));
    }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    if (bytes.byteLength > MAX_RESOURCE_BYTES) throw new Error(t("单张图片不能超过 8MB"));
    return new Blob([bytes], { type: mimeType });
}

export async function blobToDataUrl(blob, mimeType) {
    if (blob.size > MAX_RESOURCE_BYTES) throw new Error(t("单张图片不能超过 8MB"));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return `data:${mimeType};base64,${btoa(binary)}`;
}
