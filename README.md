Wavy Industries website

First
```bash
npm install
```
then to run the app locally
```bash
npm run dev
```

## Meta Pixel Integration

The site includes Meta Pixel tracking for analytics and conversion tracking. The Meta Pixel ID is configured in `src/components/MetaPixel.astro` and will automatically track PageView events on all pages.

### Programmatic Event Tracking

You can track custom events using the utility:

```typescript
import { trackEvent, trackCustomEvent } from '~/lib/utils/metaPixel';

// Track standard events
trackEvent('ViewContent', { content_name: 'MONKEY Product Page' });
trackEvent('AddToCart', { value: 99.99, currency: 'USD' });
trackEvent('Purchase', { value: 99.99, currency: 'USD' });

// Track custom events
trackCustomEvent('CustomButtonClick', { button_name: 'Download Firmware' });
```

### Common Events

- `PageView` - Automatically tracked on all pages
- `ViewContent` - View product/content pages
- `AddToCart` - Add item to cart
- `InitiateCheckout` - Start checkout process
- `Purchase` - Complete a purchase
- `Lead` - Submit a lead form
