# Optional service card

Add a card only for a real service or organization you represent. Replace prompts and the URL before enabling the card. This is a format example outside the website content; it is not an existing service.

```yaml
services:
  - id: your-service
    name: "[Service or organization name]"
    description: "[What enquiries this service handles]"
    display_order: 10
    enabled: false
    action:
      label: "[Enquiry link label]"
      url: https://example.com/replace-with-real-enquiry-page
    email: null
    phone: null
```

The action URL is required for a card. Enable the card only after replacing it. Optional fields include `website: {label, url}` and a Google Calendar appointment schedule `booking: {label, url, enabled}`. Use real public destinations.

