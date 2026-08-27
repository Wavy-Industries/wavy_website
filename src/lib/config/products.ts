export interface Product {
    sku: string;              // internal cart key, e.g. 'monkey'
    name: string;             // short label, e.g. 'MONKEY'
    displayName: string;      // long label, e.g. 'WAVY MONKEY'
    productCode: string;      // Shopify product code for tracking, e.g. 'WIMKY001'
    shopifyProductId: string; // Shopify GID
    preorder: boolean;
    /*
     * The EUR price before VAT, as set on the EUR market in Shopify, which adds
     * each country's VAT on top before returning a price and says nothing about
     * having done so. Keep in step with Shopify by hand — nothing checks it.
     */
    basePriceEur: number;
}

export const PRODUCTS: Record<string, Product> = {
    monkey: {
        sku: 'monkey',
        name: 'MONKEY',
        displayName: 'WAVY MONKEY',
        productCode: 'WIMKY001',
        shopifyProductId: 'gid://shopify/Product/14798616985972',
        preorder: false,
        basePriceEur: 79,
    },
    bridge: {
        sku: 'bridge',
        name: 'BRIDGE',
        displayName: 'WAVY BRIDGE',
        productCode: 'WIBRG001',
        shopifyProductId: 'gid://shopify/Product/15048558838132',
        preorder: true,
        basePriceEur: 89,
    },
};

export function getProduct(sku: string): Product | undefined {
    return PRODUCTS[sku];
}

export function isPreorder(sku: string): boolean {
    return PRODUCTS[sku]?.preorder ?? false;
}
