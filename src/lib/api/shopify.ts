/*
 * Storefront API client.
 *
 * Two calls: prices once per page load, and a cart created on the way to
 * checkout. Nothing money-related is computed here — Shopify's numbers are
 * displayed as Shopify gives them.
 */

import { PRODUCTS } from '~/lib/config/products';

export const DOMAIN = 'checkout.wavyindustries.com';
export const TOKEN = '3f43932f0e0e93973efb1da30bd44f74';

// Shopify supports each version for a year. Bump this roughly annually.
const API_VERSION = '2025-10';
const STOREFRONT_API = `https://${DOMAIN}/api/${API_VERSION}/graphql.json`;

export interface Money {
    amount: number;
    currencyCode: string;
}

export interface ProductInfo {
    sku: string;
    variantId: string;
    available: boolean;
    price: Money;
}

export interface CountryOption {
    isoCode: string;
    name: string;
}

export interface StorefrontContext {
    products: Record<string, ProductInfo>;
    /** The country Shopify actually priced in. */
    countryCode: string | null;
    countries: CountryOption[];
}

async function storefront(query: string, variables: Record<string, unknown>): Promise<any> {
    const res = await fetch(STOREFRONT_API, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Storefront-Access-Token': TOKEN,
        },
        body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`Storefront API ${res.status}`);
    const body = await res.json();
    if (body.errors?.length) throw new Error(body.errors[0].message ?? 'Storefront API error');
    if (!body.data) throw new Error('Storefront API returned no data');
    return body.data;
}

/** Every product's price and variant id, plus the countries Shopify will price in. */
export async function fetchStorefrontContext(countryCode: string | null): Promise<StorefrontContext> {
    const skus = Object.keys(PRODUCTS);
    const productFields = skus
        .map(
            (sku, i) =>
                `p${i}: product(id: "${PRODUCTS[sku].shopifyProductId}") {
                   variants(first: 1) { nodes { id availableForSale price { amount currencyCode } } }
                 }`
        )
        .join('\n');

    const data = await storefront(
        `query context($country: CountryCode) @inContext(country: $country) {
           ${productFields}
           localization {
             country { isoCode }
             availableCountries { isoCode name }
           }
         }`,
        { country: countryCode }
    );

    const products: Record<string, ProductInfo> = {};
    skus.forEach((sku, i) => {
        const variant = data[`p${i}`]?.variants?.nodes?.[0];
        if (!variant) return;
        products[sku] = {
            sku,
            variantId: variant.id,
            available: variant.availableForSale !== false,
            price: {
                amount: parseFloat(variant.price.amount),
                currencyCode: variant.price.currencyCode,
            },
        };
    });

    return {
        products,
        countryCode: data.localization?.country?.isoCode ?? null,
        countries: data.localization?.availableCountries ?? [],
    };
}

export interface CartAttribution {
    visitorId?: string;
    ref?: string;
}

/** Creates the cart and returns the URL to send the buyer to. */
export async function cartCreate(
    lines: { variantId: string; quantity: number }[],
    countryCode: string | null,
    attribution: CartAttribution
): Promise<{ id: string; checkoutUrl: string }> {
    const attributes = [];
    if (attribution.visitorId) attributes.push({ key: '_wavy_vid', value: attribution.visitorId });
    if (attribution.ref) attributes.push({ key: '_wavy_ref', value: attribution.ref });

    const data = await storefront(
        `mutation create($input: CartInput!, $country: CountryCode) @inContext(country: $country) {
           cartCreate(input: $input) {
             cart { id checkoutUrl }
             userErrors { field message }
           }
         }`,
        {
            input: {
                lines: lines.map((l) => ({ merchandiseId: l.variantId, quantity: l.quantity })),
                buyerIdentity: countryCode ? { countryCode } : undefined,
                attributes,
                // A ref doubles as a discount code when the shop has one by that
                // name; Shopify ignores it when it does not.
                discountCodes: attribution.ref ? [attribution.ref] : undefined,
            },
            country: countryCode,
        }
    );

    const payload = data.cartCreate;
    if (payload?.userErrors?.length) throw new Error(payload.userErrors[0].message ?? 'Checkout failed');
    if (!payload?.cart) throw new Error('Checkout returned no cart');
    return payload.cart;
}
