# App Store Connect MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server for the [App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi). It lets AI assistants manage apps, versions, localizations, screenshots, creative assets, TestFlight, bundle IDs, devices, users, and analytics reports.

[![npm](https://img.shields.io/npm/v/@yunyang088/app-store-connect-mcp-server)](https://www.npmjs.com/package/@yunyang088/app-store-connect-mcp-server)

> Forked from [JoshuaRileyDev/app-store-connect-mcp-server](https://github.com/JoshuaRileyDev/app-store-connect-mcp-server) (archived).

## Setup

Create an API key in [App Store Connect → Users and Access → Integrations](https://appstoreconnect.apple.com/access/integrations/api), download the `.p8` file, and note the Key ID and Issuer ID.

Add the server to your MCP client config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "app-store-connect": {
      "command": "npx",
      "args": ["-y", "@yunyang088/app-store-connect-mcp-server"],
      "env": {
        "APP_STORE_CONNECT_KEY_ID": "YOUR_KEY_ID",
        "APP_STORE_CONNECT_ISSUER_ID": "YOUR_ISSUER_ID",
        "APP_STORE_CONNECT_P8_PATH": "/path/to/AuthKey_XXXXXXXXXX.p8",
        "APP_STORE_CONNECT_VENDOR_NUMBER": "OPTIONAL"
      }
    }
  }
}
```

For Claude Code:

```bash
claude mcp add app-store-connect \
  -e APP_STORE_CONNECT_KEY_ID=YOUR_KEY_ID \
  -e APP_STORE_CONNECT_ISSUER_ID=YOUR_ISSUER_ID \
  -e APP_STORE_CONNECT_P8_PATH=/path/to/AuthKey_XXXXXXXXXX.p8 \
  -- npx -y @yunyang088/app-store-connect-mcp-server
```

`APP_STORE_CONNECT_VENDOR_NUMBER` is optional. When set, the sales and finance report tools are enabled.

## Tools

| Area | Tools |
| --- | --- |
| Apps | `list_apps`, `get_app_info` |
| Versions | `create_app_store_version`, `list_app_store_versions` |
| Version localizations | `list_app_store_version_localizations`, `get_app_store_version_localization`, `create_app_store_version_localization`, `update_app_store_version_localization` |
| App info localizations (name / subtitle) | `list_app_info_localizations`, `create_app_info_localization`, `update_app_info_localization` |
| Screenshots | `list_app_screenshot_sets`, `create_app_screenshot_set`, `list_app_screenshots`, `upload_app_screenshot`, `delete_app_screenshot` |
| Asset Library (iOS 27 creative assets, iPhone Duo) | `get_asset_library_ref_data`, `list_asset_library_media`, `upload_asset_library_media`, `create_asset_placement`, `list_asset_placements`, `reorder_asset_placements`, `delete_asset_placement`, `delete_asset_library_media` |
| TestFlight | `list_beta_groups`, `list_group_testers`, `add_tester_to_group`, `remove_tester_from_group`, `list_beta_feedback_screenshots`, `get_beta_feedback_screenshot` |
| Bundle IDs | `list_bundle_ids`, `get_bundle_id_info`, `create_bundle_id`, `enable_bundle_capability`, `disable_bundle_capability` |
| Devices & users | `list_devices`, `list_users` |
| Analytics | `create_analytics_report_request`, `list_analytics_report_requests`, `list_analytics_reports`, `list_analytics_report_instances`, `list_analytics_report_segments`, `download_analytics_report_segment` |
| Sales & finance (vendor number required) | `download_sales_report`, `download_finance_report` |
| Xcode | `list_schemes` |

Notes:

- `upload_app_screenshot` handles the full reserve → upload → commit flow for a local PNG.
- `create_app_screenshot_set` expects display types with the `APP_` prefix, e.g. `APP_IPHONE_67`.
- Asset Library flow: `upload_asset_library_media` (reserve → upload → commit → wait for processing) → `create_asset_placement` on a version localization.
  - Product page header: `PRODUCT_PAGE_HEADER_ASSET`, 21:9 3840×1646 PNG. Search results: `APP_STORE_SEARCH_RESULTS_ASSET`, 3:2 up to 3840×2560. A 16:9 5244×2950 PNG universal asset fits both. Both use placement group `DEFAULT_PROFILE`, one per localization; upload with category `CREATIVE_ASSETS`.
  - iPhone Duo screenshots have no legacy `screenshotDisplayType`; upload with category `APP_SCREENSHOTS_AND_PREVIEWS` and place as `APP_SCREENSHOT` in group `IPHONE_DUO_PROFILE` (2853×2007 / 2034×1398, or portrait).
  - `get_asset_library_ref_data` returns the live specs and placement groups.
- When a new version is being prepared, the app has two app infos (live and editable). App info localization tools now resolve the editable one, so name/subtitle edits go to the version being prepared.
- Analytics flow: request → reports → instances → segments → download. Only one `ONGOING` request is allowed per app.

## Development

```bash
git clone https://github.com/yunyang088/app-store-connect-mcp-server.git
cd app-store-connect-mcp-server
npm install
npm run build   # compile TypeScript to dist/
npm start       # run the server on stdio
```

## License

MIT
