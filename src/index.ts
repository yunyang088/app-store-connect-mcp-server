#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import axios from 'axios';

import { AppStoreConnectConfig } from './types/index.js';
import { AppStoreConnectClient } from './services/index.js';
import { 
  AppHandlers, 
  BetaHandlers, 
  BundleHandlers, 
  DeviceHandlers, 
  UserHandlers, 
  AnalyticsHandlers,
  XcodeHandlers,
  LocalizationHandlers,
  ScreenshotHandlers,
  AssetLibraryHandlers,
  InAppPurchaseHandlers,
  ListingHandlers
} from './handlers/index.js';

const ASSET_PLACEMENT_TYPES = [
  "APP_SCREENSHOT",
  "IMESSAGE_APP_SCREENSHOT",
  "APP_PREVIEW",
  "PRODUCT_PAGE_HEADER_ASSET",
  "APP_STORE_SEARCH_RESULTS_ASSET",
  "SEARCH_RESULTS_ADS_ASSET",
  "TODAY_TAB_ADS_ASSET",
  "EVENT_CARD_ASSET",
  "EVENT_DETAILS_PAGE_ASSET",
  "RETENTION_MESSAGE_ASSET"
];

const IAP_TYPES = ["CONSUMABLE", "NON_CONSUMABLE", "NON_RENEWING_SUBSCRIPTION"];

const IAP_STATES = [
  "MISSING_METADATA", "WAITING_FOR_UPLOAD", "PROCESSING_CONTENT", "READY_TO_SUBMIT",
  "WAITING_FOR_REVIEW", "IN_REVIEW", "DEVELOPER_ACTION_NEEDED", "PENDING_BINARY_APPROVAL",
  "APPROVED", "DEVELOPER_REMOVED_FROM_SALE", "REMOVED_FROM_SALE", "REJECTED"
];

const IAP_INCLUDES = [
  "inAppPurchaseLocalizations", "pricePoints", "content", "appStoreReviewScreenshot",
  "promotedPurchase", "iapPriceSchedule", "inAppPurchaseAvailability", "images", "offerCodes", "versions"
];

const REVIEW_DETAIL_PROPERTIES = {
  contactFirstName: { type: "string", description: "Contact first name" },
  contactLastName: { type: "string", description: "Contact last name" },
  contactPhone: { type: "string", description: "Contact phone, with country code, e.g. +1 555 0100" },
  contactEmail: { type: "string", description: "Contact email" },
  demoAccountRequired: { type: "boolean", description: "Whether App Review needs a demo account to sign in" },
  demoAccountName: { type: "string", description: "Demo account user name" },
  demoAccountPassword: { type: "string", description: "Demo account password" },
  notes: { type: "string", description: "Notes for App Review" }
};

// Load environment variables
const config: AppStoreConnectConfig = {
  keyId: process.env.APP_STORE_CONNECT_KEY_ID!,
  issuerId: process.env.APP_STORE_CONNECT_ISSUER_ID!,
  privateKeyPath: process.env.APP_STORE_CONNECT_P8_PATH!,
  vendorNumber: process.env.APP_STORE_CONNECT_VENDOR_NUMBER, // Optional for sales/finance reports
};

class AppStoreConnectServer {
  private server: Server;
  private client: AppStoreConnectClient;
  private appHandlers: AppHandlers;
  private betaHandlers: BetaHandlers;
  private bundleHandlers: BundleHandlers;
  private deviceHandlers: DeviceHandlers;
  private userHandlers: UserHandlers;
  private analyticsHandlers: AnalyticsHandlers;
  private xcodeHandlers: XcodeHandlers;
  private localizationHandlers: LocalizationHandlers;
  private screenshotHandlers: ScreenshotHandlers;
  private assetLibraryHandlers: AssetLibraryHandlers;
  private inAppPurchaseHandlers: InAppPurchaseHandlers;
  private listingHandlers: ListingHandlers;

  constructor() {
    this.server = new Server({
      name: "appstore-connect-server",
      version: "1.3.1"
    }, {
      capabilities: {
        tools: {}
      }
    });

    this.client = new AppStoreConnectClient(config);
    this.appHandlers = new AppHandlers(this.client);
    this.betaHandlers = new BetaHandlers(this.client);
    this.bundleHandlers = new BundleHandlers(this.client);
    this.deviceHandlers = new DeviceHandlers(this.client);
    this.userHandlers = new UserHandlers(this.client);
    this.analyticsHandlers = new AnalyticsHandlers(this.client, config);
    this.xcodeHandlers = new XcodeHandlers();
    this.localizationHandlers = new LocalizationHandlers(this.client);
    this.screenshotHandlers = new ScreenshotHandlers(this.client);
    this.assetLibraryHandlers = new AssetLibraryHandlers(this.client);
    this.inAppPurchaseHandlers = new InAppPurchaseHandlers(this.client);
    this.listingHandlers = new ListingHandlers(this.client);

    this.setupHandlers();
  }

  private buildToolsList() {
    const baseTools = [
        // App Management Tools
        {
          name: "list_apps",
          description: "Get a list of all apps in App Store Connect",
          inputSchema: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Maximum number of apps to return (default: 100)",
                minimum: 1,
                maximum: 200
              }
            }
          }
        },
        {
          name: "get_app_info",
          description: "Get detailed information about a specific app",
          inputSchema: {
            type: "object", 
            properties: {
              appId: {
                type: "string",
                description: "The ID of the app to get information for"
              },
              include: {
                type: "array",
                items: {
                  type: "string",
                  enum: [
                    "appClips", "appInfos", "appStoreVersions", "availableTerritories",
                    "betaAppReviewDetail", "betaGroups", "betaLicenseAgreement", "builds",
                    "endUserLicenseAgreement", "gameCenterEnabledVersions", "inAppPurchases",
                    "preOrder", "prices", "reviewSubmissions"
                  ]
                },
                description: "Optional relationships to include in the response"
              }
            },
            required: ["appId"]
          }
        },

        // Beta Testing Tools
        {
          name: "list_beta_groups",
          description: "Get a list of all beta groups (internal and external)",
          inputSchema: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Maximum number of groups to return (default: 100)",
                minimum: 1,
                maximum: 200
              }
            }
          }
        },
        {
          name: "list_group_testers",
          description: "Get a list of all testers in a specific beta group",
          inputSchema: {
            type: "object",
            properties: {
              groupId: {
                type: "string",
                description: "The ID of the beta group"
              },
              limit: {
                type: "number",
                description: "Maximum number of testers to return (default: 100)",
                minimum: 1,
                maximum: 200
              }
            },
            required: ["groupId"]
          }
        },
        {
          name: "add_tester_to_group",
          description: "Add a new tester to a beta group",
          inputSchema: {
            type: "object",
            properties: {
              groupId: {
                type: "string",
                description: "The ID of the beta group"
              },
              email: {
                type: "string",
                description: "Email address of the tester"
              },
              firstName: {
                type: "string",
                description: "First name of the tester"
              },
              lastName: {
                type: "string",
                description: "Last name of the tester"
              }
            },
            required: ["groupId", "email", "firstName", "lastName"]
          }
        },
        {
          name: "remove_tester_from_group",
          description: "Remove a tester from a beta group",
          inputSchema: {
            type: "object",
            properties: {
              groupId: {
                type: "string",
                description: "The ID of the beta group"
              },
              testerId: {
                type: "string",
                description: "The ID of the beta tester"
              }
            },
            required: ["groupId", "testerId"]
          }
        },
        {
          name: "list_beta_feedback_screenshots",
          description: "List all beta feedback screenshot submissions for an app. This includes feedback with screenshots, device information, and tester comments. You can identify the app using either appId or bundleId.",
          inputSchema: {
            type: "object",
            properties: {
              appId: {
                type: "string",
                description: "The ID of the app to get feedback for (e.g., '6747745091')"
              },
              bundleId: {
                type: "string",
                description: "The bundle ID of the app (e.g., 'com.example.app'). Can be used instead of appId."
              },
              buildId: {
                type: "string",
                description: "Filter by specific build ID (optional)"
              },
              devicePlatform: {
                type: "string",
                enum: ["IOS", "MAC_OS", "TV_OS", "VISION_OS"],
                description: "Filter by device platform (optional)"
              },
              appPlatform: {
                type: "string",
                enum: ["IOS", "MAC_OS", "TV_OS", "VISION_OS"],
                description: "Filter by app platform (optional)"
              },
              deviceModel: {
                type: "string",
                description: "Filter by device model (e.g., 'iPhone15_2') (optional)"
              },
              osVersion: {
                type: "string",
                description: "Filter by OS version (e.g., '18.4.1') (optional)"
              },
              testerId: {
                type: "string",
                description: "Filter by specific tester ID (optional)"
              },
              limit: {
                type: "number",
                description: "Maximum number of feedback items to return (default: 50, max: 200)",
                minimum: 1,
                maximum: 200
              },
              sort: {
                type: "string",
                enum: ["createdDate", "-createdDate"],
                description: "Sort order for results (default: -createdDate for newest first)"
              },
              includeBuilds: {
                type: "boolean",
                description: "Include build information in response (optional)",
                default: false
              },
              includeTesters: {
                type: "boolean",
                description: "Include tester information in response (optional)",
                default: false
              }
            },
            required: []
          }
        },
        {
          name: "get_beta_feedback_screenshot",
          description: "Get detailed information about a specific beta feedback screenshot submission. By default, downloads and returns the screenshot image.",
          inputSchema: {
            type: "object",
            properties: {
              feedbackId: {
                type: "string",
                description: "The ID of the beta feedback screenshot submission"
              },
              includeBuilds: {
                type: "boolean",
                description: "Include build information in response (optional)",
                default: false
              },
              includeTesters: {
                type: "boolean",
                description: "Include tester information in response (optional)",
                default: false
              },
              downloadScreenshot: {
                type: "boolean",
                description: "Download and return the screenshot as an image (default: true)",
                default: true
              }
            },
            required: ["feedbackId"]
          }
        },
        
        // App Store Version Localization Tools
        {
          name: "create_app_store_version",
          description: "Create a new app store version for an app",
          inputSchema: {
            type: "object",
            properties: {
              appId: {
                type: "string",
                description: "The ID of the app"
              },
              platform: {
                type: "string",
                description: "The platform for this version",
                enum: ["IOS", "MAC_OS", "TV_OS", "VISION_OS"]
              },
              versionString: {
                type: "string",
                description: "Version string in format X.Y or X.Y.Z (e.g., '1.0' or '1.0.0')"
              },
              copyright: {
                type: "string",
                description: "Copyright text for this version (optional)"
              },
              releaseType: {
                type: "string",
                description: "How the app should be released",
                enum: ["MANUAL", "AFTER_APPROVAL", "SCHEDULED"]
              },
              earliestReleaseDate: {
                type: "string",
                description: "Earliest release date in ISO 8601 format (required when releaseType is SCHEDULED)"
              },
              buildId: {
                type: "string",
                description: "ID of the build to associate with this version (optional)"
              }
            },
            required: ["appId", "platform", "versionString"]
          }
        },
        {
          name: "list_app_store_versions",
          description: "Get all app store versions for a specific app",
          inputSchema: {
            type: "object",
            properties: {
              appId: {
                type: "string",
                description: "The ID of the app"
              },
              limit: {
                type: "number",
                description: "Maximum number of versions to return (default: 100)",
                minimum: 1,
                maximum: 200
              },
              filter: {
                type: "object",
                properties: {
                  platform: {
                    type: "string",
                    description: "Filter by platform (IOS, MAC_OS, TV_OS)",
                    enum: ["IOS", "MAC_OS", "TV_OS"]
                  },
                  versionString: {
                    type: "string",
                    description: "Filter by version string (e.g., '1.0.0')"
                  },
                  appStoreState: {
                    type: "string",
                    description: "Filter by app store state",
                    enum: [
                      "DEVELOPER_REMOVED_FROM_SALE",
                      "DEVELOPER_REJECTED", 
                      "IN_REVIEW",
                      "INVALID_BINARY",
                      "METADATA_REJECTED",
                      "PENDING_APPLE_RELEASE",
                      "PENDING_CONTRACT",
                      "PENDING_DEVELOPER_RELEASE",
                      "PREPARE_FOR_SUBMISSION",
                      "PREORDER_READY_FOR_SALE",
                      "PROCESSING_FOR_APP_STORE",
                      "READY_FOR_SALE",
                      "REJECTED",
                      "REMOVED_FROM_SALE",
                      "WAITING_FOR_EXPORT_COMPLIANCE",
                      "WAITING_FOR_REVIEW",
                      "REPLACED_WITH_NEW_VERSION"
                    ]
                  }
                },
                description: "Optional filters for app store versions"
              }
            },
            required: ["appId"]
          }
        },
        {
          name: "list_app_store_version_localizations",
          description: "Get all localizations for a specific app store version",
          inputSchema: {
            type: "object",
            properties: {
              appStoreVersionId: {
                type: "string",
                description: "The ID of the app store version"
              },
              limit: {
                type: "number",
                description: "Maximum number of localizations to return (default: 100)",
                minimum: 1,
                maximum: 200
              }
            },
            required: ["appStoreVersionId"]
          }
        },
        {
          name: "get_app_store_version_localization",
          description: "Get detailed information about a specific app store version localization",
          inputSchema: {
            type: "object",
            properties: {
              localizationId: {
                type: "string",
                description: "The ID of the app store version localization"
              }
            },
            required: ["localizationId"]
          }
        },
        {
          name: "update_app_store_version_localization",
          description: "Update a specific field in an app store version localization",
          inputSchema: {
            type: "object",
            properties: {
              localizationId: {
                type: "string",
                description: "The ID of the app store version localization to update"
              },
              field: {
                type: "string",
                enum: ["description", "keywords", "marketingUrl", "promotionalText", "supportUrl", "whatsNew"],
                description: "The field to update"
              },
              value: {
                type: "string",
                description: "The new value for the field"
              }
            },
            required: ["localizationId", "field", "value"]
          }
        },
        {
          name: "create_app_store_version_localization",
          description: "Create a new localization for an app store version (e.g. to add a new language)",
          inputSchema: {
            type: "object",
            properties: {
              appStoreVersionId: {
                type: "string",
                description: "The ID of the app store version"
              },
              locale: {
                type: "string",
                description: "The locale for the localization (e.g. 'zh-Hans', 'ja', 'en-US')"
              },
              description: {
                type: "string",
                description: "App description for this locale (optional)"
              },
              keywords: {
                type: "string",
                description: "Comma-separated keywords for this locale (optional)"
              },
              promotionalText: {
                type: "string",
                description: "Promotional text for this locale (optional)"
              },
              supportUrl: {
                type: "string",
                description: "Support URL for this locale (optional)"
              },
              marketingUrl: {
                type: "string",
                description: "Marketing URL for this locale (optional)"
              },
              whatsNew: {
                type: "string",
                description: "What's New text for this locale (optional)"
              }
            },
            required: ["appStoreVersionId", "locale"]
          }
        },

        // App Info Localization Tools (app name/subtitle)
        {
          name: "list_app_info_localizations",
          description: "List all app info localizations (localized app name/subtitle) for an app. Provide appInfoId directly, or appId to resolve the app info automatically (prefers the editable one, e.g. PREPARE_FOR_SUBMISSION, over the live read-only one).",
          inputSchema: {
            type: "object",
            properties: {
              appId: {
                type: "string",
                description: "The ID of the app (optional if appInfoId is provided)"
              },
              appInfoId: {
                type: "string",
                description: "The ID of the app info (optional if appId is provided)"
              },
              limit: {
                type: "number",
                description: "Maximum number of localizations to return (default: 100)",
                minimum: 1,
                maximum: 200
              }
            }
          }
        },
        {
          name: "create_app_info_localization",
          description: "Create a new app info localization (localized app name/subtitle). Provide either appInfoId directly, or appId to resolve the app info automatically (prefers the editable one over the live read-only one).",
          inputSchema: {
            type: "object",
            properties: {
              appInfoId: {
                type: "string",
                description: "The ID of the app info (optional if appId is provided)"
              },
              appId: {
                type: "string",
                description: "The ID of the app; the current app info is resolved automatically (optional if appInfoId is provided)"
              },
              locale: {
                type: "string",
                description: "The locale for the localization (e.g. 'zh-Hans', 'ja', 'en-US')"
              },
              name: {
                type: "string",
                description: "Localized app name (optional)"
              },
              subtitle: {
                type: "string",
                description: "Localized app subtitle (optional)"
              },
              privacyPolicyUrl: {
                type: "string",
                description: "Privacy policy URL for this locale (optional)"
              },
              privacyChoicesUrl: {
                type: "string",
                description: "Privacy choices URL for this locale (optional)"
              },
              privacyPolicyText: {
                type: "string",
                description: "Privacy policy text for this locale (optional)"
              }
            },
            required: ["locale"]
          }
        },
        {
          name: "update_app_info_localization",
          description: "Update a specific field in an app info localization (localized app name/subtitle)",
          inputSchema: {
            type: "object",
            properties: {
              appInfoLocalizationId: {
                type: "string",
                description: "The ID of the app info localization to update"
              },
              field: {
                type: "string",
                enum: ["name", "subtitle", "privacyPolicyUrl", "privacyChoicesUrl", "privacyPolicyText"],
                description: "The field to update"
              },
              value: {
                type: "string",
                description: "The new value for the field"
              }
            },
            required: ["appInfoLocalizationId", "field", "value"]
          }
        },

        // App Screenshot Tools
        {
          name: "list_app_screenshot_sets",
          description: "List all screenshot sets for an app store version localization",
          inputSchema: {
            type: "object",
            properties: {
              appStoreVersionLocalizationId: {
                type: "string",
                description: "The ID of the app store version localization"
              },
              limit: {
                type: "number",
                description: "Maximum number of screenshot sets to return (default: 100)",
                minimum: 1,
                maximum: 200
              }
            },
            required: ["appStoreVersionLocalizationId"]
          }
        },
        {
          name: "create_app_screenshot_set",
          description: "Create a new screenshot set for an app store version localization. The screenshotDisplayType must carry the APP_ prefix, e.g. APP_IPHONE_65, APP_IPHONE_67, APP_IPAD_PRO_3GEN_129 (a bare value like IPHONE_65 is rejected with a 409 error).",
          inputSchema: {
            type: "object",
            properties: {
              appStoreVersionLocalizationId: {
                type: "string",
                description: "The ID of the app store version localization"
              },
              screenshotDisplayType: {
                type: "string",
                description: "The display type, must start with APP_ (e.g. 'APP_IPHONE_65', 'APP_IPHONE_67', 'APP_IPAD_PRO_3GEN_129')"
              }
            },
            required: ["appStoreVersionLocalizationId", "screenshotDisplayType"]
          }
        },
        {
          name: "list_app_screenshots",
          description: "List all screenshots in a screenshot set",
          inputSchema: {
            type: "object",
            properties: {
              appScreenshotSetId: {
                type: "string",
                description: "The ID of the screenshot set"
              },
              limit: {
                type: "number",
                description: "Maximum number of screenshots to return (default: 100)",
                minimum: 1,
                maximum: 200
              }
            },
            required: ["appScreenshotSetId"]
          }
        },
        {
          name: "delete_app_screenshot",
          description: "Delete a screenshot from a screenshot set",
          inputSchema: {
            type: "object",
            properties: {
              appScreenshotId: {
                type: "string",
                description: "The ID of the screenshot to delete"
              }
            },
            required: ["appScreenshotId"]
          }
        },
        {
          name: "upload_app_screenshot",
          description: "Upload a local PNG file to a screenshot set. Runs the full three-step flow: reserve the screenshot, upload the file chunks, then commit with the md5 checksum.",
          inputSchema: {
            type: "object",
            properties: {
              appScreenshotSetId: {
                type: "string",
                description: "The ID of the screenshot set to upload into"
              },
              filePath: {
                type: "string",
                description: "Absolute path to the local PNG file to upload"
              }
            },
            required: ["appScreenshotSetId", "filePath"]
          }
        },

        // Asset Library Tools (API 4.x / iOS 27 creative assets)
        {
          name: "get_asset_library_ref_data",
          description: "Get Asset Library reference data: placement groups (e.g. IPHONE_DUO_PROFILE, DEFAULT_PROFILE), per-placement limits for app store versions, and image/video specs (exact sizes, aspect ratios, formats). Filter by placementType/platform to keep the result small.",
          inputSchema: {
            type: "object",
            properties: {
              placementType: {
                type: "string",
                enum: ASSET_PLACEMENT_TYPES,
                description: "Only return specs/policies compatible with this placement type (optional)"
              },
              platform: {
                type: "string",
                enum: ["IPHONE_APP_STORE", "IPAD_APP_STORE", "WATCH_APP_STORE", "IMESSAGE_APP_STORE", "VISION_PRO_APP_STORE", "MAC_APP_STORE", "TV_APP_STORE"],
                description: "Only return placement groups for this platform (optional)"
              }
            }
          }
        },
        {
          name: "list_asset_library_media",
          description: "List images or videos already uploaded to an app's Asset Library",
          inputSchema: {
            type: "object",
            properties: {
              appId: { type: "string", description: "The ID of the app" },
              mediaType: { type: "string", enum: ["IMAGE", "VIDEO"], description: "Images or videos (default: IMAGE)" },
              category: { type: "string", enum: ["CREATIVE_ASSETS", "APP_SCREENSHOTS_AND_PREVIEWS"], description: "Filter by category (optional)" },
              state: { type: "string", description: "Filter by state, e.g. COMPLETE, FAILED, APPROVED (optional)" },
              limit: { type: "number", description: "Maximum number to return (default: 50)", minimum: 1, maximum: 200 }
            },
            required: ["appId"]
          }
        },
        {
          name: "upload_asset_library_media",
          description: "Upload a local image (.png/.jpg) or video (.mov/.m4v/.mp4) to an app's Asset Library. Runs reserve → chunk upload → commit, then waits for processing and returns the final state (FAILED includes stateDetails, e.g. wrong dimensions). Use category CREATIVE_ASSETS for product page header / search results assets, APP_SCREENSHOTS_AND_PREVIEWS for screenshots and app previews (including iPhone Duo). Then attach it with create_asset_placement.",
          inputSchema: {
            type: "object",
            properties: {
              appId: { type: "string", description: "The ID of the app" },
              filePath: { type: "string", description: "Absolute path to the local file" },
              category: { type: "string", enum: ["CREATIVE_ASSETS", "APP_SCREENSHOTS_AND_PREVIEWS"], description: "Asset category" },
              referenceName: { type: "string", description: "Name shown in the Asset Library (optional)" },
              previewFrameTimeCode: { type: "string", description: "Video poster frame timecode, e.g. '00:00:05:00' (videos only, optional)" },
              waitForProcessing: { type: "boolean", description: "Poll until processing finishes (default: true)" }
            },
            required: ["appId", "filePath", "category"]
          }
        },
        {
          name: "create_asset_placement",
          description: "Attach an Asset Library image or video to a localization. Examples: product page header → placementType PRODUCT_PAGE_HEADER_ASSET; search results → APP_STORE_SEARCH_RESULTS_ASSET (both use placementGroup DEFAULT_PROFILE, 1 per localization; a 16:9 5244x2950 universal asset can be placed in both); iPhone Duo screenshot → APP_SCREENSHOT with placementGroup IPHONE_DUO_PROFILE (up to 10). Exactly one of imageId/videoId and exactly one localization target.",
          inputSchema: {
            type: "object",
            properties: {
              placementType: { type: "string", enum: ASSET_PLACEMENT_TYPES, description: "Where the asset is shown" },
              placementGroup: { type: "string", description: "Placement profile group, e.g. DEFAULT_PROFILE, IPHONE_DUO_PROFILE, IPHONE_DYNAMIC_ISLAND_LARGE_PROFILE, IPAD_13_PROFILE (default: DEFAULT_PROFILE)" },
              imageId: { type: "string", description: "Asset Library image ID" },
              videoId: { type: "string", description: "Asset Library video ID" },
              appStoreVersionLocalizationId: { type: "string", description: "Target app store version localization" },
              appCustomProductPageLocalizationId: { type: "string", description: "Target custom product page localization" },
              appEventLocalizationId: { type: "string", description: "Target in-app event localization" }
            },
            required: ["placementType"]
          }
        },
        {
          name: "list_asset_placements",
          description: "List Asset Library placements (screenshots, previews, header and search results assets) on an app store version localization, with the attached image/video included",
          inputSchema: {
            type: "object",
            properties: {
              appStoreVersionLocalizationId: { type: "string", description: "The ID of the app store version localization" },
              placementType: { type: "string", enum: ASSET_PLACEMENT_TYPES, description: "Filter by placement type (optional)" },
              placementGroup: { type: "string", description: "Filter by placement group, e.g. IPHONE_DUO_PROFILE (optional)" },
              limit: { type: "number", description: "Maximum number to return (default: 100)", minimum: 1, maximum: 200 }
            },
            required: ["appStoreVersionLocalizationId"]
          }
        },
        {
          name: "reorder_asset_placements",
          description: "Set the display order of placements in one placement group (e.g. the iPhone Duo screenshots) on an app store version localization",
          inputSchema: {
            type: "object",
            properties: {
              appStoreVersionLocalizationId: { type: "string", description: "The ID of the app store version localization" },
              placementGroup: { type: "string", description: "Placement group, e.g. IPHONE_DUO_PROFILE" },
              placementIds: { type: "array", items: { type: "string" }, description: "Placement IDs in the desired order" }
            },
            required: ["appStoreVersionLocalizationId", "placementGroup", "placementIds"]
          }
        },
        {
          name: "delete_asset_placement",
          description: "Remove a placement from a localization (the image/video stays in the Asset Library)",
          inputSchema: {
            type: "object",
            properties: {
              placementId: { type: "string", description: "The ID of the placement" }
            },
            required: ["placementId"]
          }
        },
        {
          name: "delete_asset_library_media",
          description: "Delete an image or video from the Asset Library",
          inputSchema: {
            type: "object",
            properties: {
              imageId: { type: "string", description: "Asset Library image ID" },
              videoId: { type: "string", description: "Asset Library video ID" }
            }
          }
        },

        // In-App Purchase Tools (inAppPurchasesV2)
        {
          name: "list_in_app_purchases",
          description: "List an app's in-app purchases (consumable, non-consumable, non-renewing subscription) with optional filters",
          inputSchema: {
            type: "object",
            properties: {
              appId: { type: "string", description: "The ID of the app" },
              productId: { type: "string", description: "Filter by product ID (optional)" },
              name: { type: "string", description: "Filter by reference name (optional)" },
              state: { type: "string", enum: IAP_STATES, description: "Filter by state (optional)" },
              inAppPurchaseType: { type: "string", enum: IAP_TYPES, description: "Filter by type (optional)" },
              include: { type: "array", items: { type: "string", enum: IAP_INCLUDES.filter((i) => i !== "pricePoints") }, description: "Related resources to include (optional; without it only attributes are returned)" },
              limit: { type: "number", description: "Maximum number to return (default: 100)", minimum: 1, maximum: 200 }
            },
            required: ["appId"]
          }
        },
        {
          name: "get_in_app_purchase",
          description: "Get one in-app purchase, optionally including related resources (versions, localizations, price schedule, availability, review screenshot, ...)",
          inputSchema: {
            type: "object",
            properties: {
              inAppPurchaseId: { type: "string", description: "The ID of the in-app purchase" },
              include: { type: "array", items: { type: "string", enum: IAP_INCLUDES }, description: "Related resources to include (optional)" }
            },
            required: ["inAppPurchaseId"]
          }
        },
        {
          name: "create_in_app_purchase",
          description: "Create an in-app purchase. A draft version 1 (PREPARE_FOR_SUBMISSION) is created with it; then add localizations, a price, availability and a review screenshot. The first in-app purchase of an app must be submitted together with an app version on the App Store Connect website.",
          inputSchema: {
            type: "object",
            properties: {
              appId: { type: "string", description: "The ID of the app" },
              name: { type: "string", description: "Reference name (internal, not shown to customers)" },
              productId: { type: "string", description: "Product ID used by StoreKit, e.g. com.example.app.coffee10 (cannot be changed or reused)" },
              inAppPurchaseType: { type: "string", enum: IAP_TYPES, description: "Type of in-app purchase" },
              reviewNote: { type: "string", description: "Notes for App Review (optional)" },
              familySharable: { type: "boolean", description: "Enable Family Sharing (optional; non-consumables only)" }
            },
            required: ["appId", "name", "productId", "inAppPurchaseType"]
          }
        },
        {
          name: "update_in_app_purchase",
          description: "Update an in-app purchase's reference name, review note or Family Sharing",
          inputSchema: {
            type: "object",
            properties: {
              inAppPurchaseId: { type: "string", description: "The ID of the in-app purchase" },
              name: { type: "string", description: "New reference name (optional)" },
              reviewNote: { type: "string", description: "New review note (optional)" },
              familySharable: { type: "boolean", description: "Family Sharing (optional; non-consumables only, cannot be turned off once on)" }
            },
            required: ["inAppPurchaseId"]
          }
        },
        {
          name: "delete_in_app_purchase",
          description: "Delete an in-app purchase that has not been submitted (its product ID can never be reused)",
          inputSchema: {
            type: "object",
            properties: {
              inAppPurchaseId: { type: "string", description: "The ID of the in-app purchase" }
            },
            required: ["inAppPurchaseId"]
          }
        },
        {
          name: "list_in_app_purchase_versions",
          description: "List an in-app purchase's metadata versions (API 4.4.1+). Localizations attach to the version in PREPARE_FOR_SUBMISSION.",
          inputSchema: {
            type: "object",
            properties: {
              inAppPurchaseId: { type: "string", description: "The ID of the in-app purchase" },
              state: { type: "string", enum: ["PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW", "WAITING_FOR_REVIEW", "IN_REVIEW", "ACCEPTED", "APPROVED", "REPLACED_WITH_NEW_VERSION", "REJECTED", "DEVELOPER_REJECTED"], description: "Filter by state (optional)" },
              includeLocalizations: { type: "boolean", description: "Include localization IDs (default: true)" }
            },
            required: ["inAppPurchaseId"]
          }
        },
        {
          name: "create_in_app_purchase_version",
          description: "Create a new draft metadata version for an in-app purchase (needed to change localizations after a version was approved)",
          inputSchema: {
            type: "object",
            properties: {
              inAppPurchaseId: { type: "string", description: "The ID of the in-app purchase" }
            },
            required: ["inAppPurchaseId"]
          }
        },
        {
          name: "list_in_app_purchase_localizations",
          description: "List in-app purchase localizations (display name + description) for a version, or for the in-app purchase itself (legacy endpoint)",
          inputSchema: {
            type: "object",
            properties: {
              inAppPurchaseVersionId: { type: "string", description: "The ID of the in-app purchase version" },
              inAppPurchaseId: { type: "string", description: "The ID of the in-app purchase (legacy, deprecated endpoint)" },
              limit: { type: "number", description: "Maximum number to return (default: 100)", minimum: 1, maximum: 200 }
            }
          }
        },
        {
          name: "create_in_app_purchase_localization",
          description: "Add a localized display name and description to an in-app purchase. Given inAppPurchaseVersionId, posts to that version (v2). Given only inAppPurchaseId, uses its PREPARE_FOR_SUBMISSION version, or falls back to the legacy v1 endpoint if there is none. Display name max 35 chars, description max 55 chars.",
          inputSchema: {
            type: "object",
            properties: {
              inAppPurchaseVersionId: { type: "string", description: "The ID of the in-app purchase version (preferred)" },
              inAppPurchaseId: { type: "string", description: "The ID of the in-app purchase (draft version resolved automatically)" },
              locale: { type: "string", description: "Locale, e.g. en-US, ja, ko, zh-Hant, zh-Hans" },
              name: { type: "string", description: "Display name shown to customers" },
              description: { type: "string", description: "Description shown to customers (optional)" }
            },
            required: ["locale", "name"]
          }
        },
        {
          name: "update_in_app_purchase_localization",
          description: "Update an in-app purchase localization's display name and/or description",
          inputSchema: {
            type: "object",
            properties: {
              localizationId: { type: "string", description: "The ID of the in-app purchase localization" },
              name: { type: "string", description: "New display name (optional)" },
              description: { type: "string", description: "New description (optional)" }
            },
            required: ["localizationId"]
          }
        },
        {
          name: "delete_in_app_purchase_localization",
          description: "Delete an in-app purchase localization",
          inputSchema: {
            type: "object",
            properties: {
              localizationId: { type: "string", description: "The ID of the in-app purchase localization" }
            },
            required: ["localizationId"]
          }
        },
        {
          name: "list_in_app_purchase_price_points",
          description: "List the price points available to an in-app purchase in one territory, compacted to id + customerPrice + proceeds + territory + currency. Use customerPrice to find a single point, e.g. territory USA + customerPrice 0.99; pass its id to set_in_app_purchase_price.",
          inputSchema: {
            type: "object",
            properties: {
              inAppPurchaseId: { type: "string", description: "The ID of the in-app purchase" },
              territory: { type: "string", description: "Territory ID (default: USA)" },
              customerPrice: { type: "string", description: "Only return the price point with this customer price, e.g. '0.99' (optional)" },
              limit: { type: "number", description: "Maximum number of price points to return after the customerPrice filter (default: all). All price points are always fetched; count is the total and truncated tells whether the list was cut", minimum: 1 }
            },
            required: ["inAppPurchaseId"]
          }
        },
        {
          name: "set_in_app_purchase_price",
          description: "Set an in-app purchase's price schedule: one manual price in the base territory (other territories are equalized automatically by Apple). Replaces the existing schedule. Price increases on a live product cannot be undone.",
          inputSchema: {
            type: "object",
            properties: {
              inAppPurchaseId: { type: "string", description: "The ID of the in-app purchase" },
              pricePointId: { type: "string", description: "Price point ID in the base territory (from list_in_app_purchase_price_points)" },
              baseTerritory: { type: "string", description: "Base territory ID (default: USA)" },
              startDate: { type: "string", description: "Start date YYYY-MM-DD (optional; default: effective immediately)" }
            },
            required: ["inAppPurchaseId", "pricePointId"]
          }
        },
        {
          name: "get_in_app_purchase_price_schedule",
          description: "Read back an in-app purchase's price schedule: base territory and manual prices with customer price. Pass territory to also see the automatic (equalized) price there.",
          inputSchema: {
            type: "object",
            properties: {
              inAppPurchaseId: { type: "string", description: "The ID of the in-app purchase" },
              territory: { type: "string", description: "Filter prices to this territory and include its automatic price (optional)" }
            },
            required: ["inAppPurchaseId"]
          }
        },
        {
          name: "get_in_app_purchase_availability",
          description: "Read an in-app purchase's availability: availableInNewTerritories and the list of territory IDs",
          inputSchema: {
            type: "object",
            properties: {
              inAppPurchaseId: { type: "string", description: "The ID of the in-app purchase" }
            },
            required: ["inAppPurchaseId"]
          }
        },
        {
          name: "set_in_app_purchase_availability",
          description: "Set the territories where an in-app purchase is sold (replaces the current availability). Give territoryIds explicitly, or excludeTerritoryIds to select all territories except those (e.g. ['CHN']); pass excludeTerritoryIds: [] for all territories.",
          inputSchema: {
            type: "object",
            properties: {
              inAppPurchaseId: { type: "string", description: "The ID of the in-app purchase" },
              availableInNewTerritories: { type: "boolean", description: "Automatically make available in territories Apple adds later" },
              territoryIds: { type: "array", items: { type: "string" }, description: "Territory IDs to sell in, e.g. ['USA', 'JPN'] (optional)" },
              excludeTerritoryIds: { type: "array", items: { type: "string" }, description: "Territory IDs to leave out, e.g. ['CHN'] (optional)" }
            },
            required: ["inAppPurchaseId", "availableInNewTerritories"]
          }
        },
        {
          name: "upload_in_app_purchase_review_screenshot",
          description: "Upload the App Review screenshot for an in-app purchase from a local PNG/JPG (reserve → chunk upload → commit with MD5, then wait for processing). Each in-app purchase has one review screenshot; set replaceExisting to delete the current one first.",
          inputSchema: {
            type: "object",
            properties: {
              inAppPurchaseId: { type: "string", description: "The ID of the in-app purchase" },
              filePath: { type: "string", description: "Absolute path to the local image" },
              replaceExisting: { type: "boolean", description: "Delete the existing review screenshot first (default: false). Apple allows only one, so the old one is gone even if the new upload then fails" },
              waitForProcessing: { type: "boolean", description: "Poll until processing finishes (default: true)" }
            },
            required: ["inAppPurchaseId", "filePath"]
          }
        },
        {
          name: "list_territories",
          description: "List all App Store territories (ID like USA, JPN, CHN and currency)",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },

        // Listing Tools (age rating, categories, review detail, version, price, availability)
        {
          name: "get_age_rating_declaration",
          description: "Get the age rating questionnaire answers of the app's editable app info",
          inputSchema: {
            type: "object",
            properties: {
              appId: { type: "string", description: "The ID of the app (the editable app info is resolved)" },
              appInfoId: { type: "string", description: "The ID of the app info (optional, overrides appId)" }
            }
          }
        },
        {
          name: "update_age_rating_declaration",
          description: "Update age rating questionnaire answers. attributes is a map such as { \"violenceCartoonOrFantasy\": \"NONE\", \"gambling\": false, \"lootBox\": false, \"messagingAndChat\": false, \"ageRatingOverrideV2\": \"NONE\" }. Frequency values: NONE, INFREQUENT_OR_MILD, FREQUENT_OR_INTENSE (or INFREQUENT, FREQUENT for newer questions).",
          inputSchema: {
            type: "object",
            properties: {
              ageRatingDeclarationId: { type: "string", description: "The ID of the age rating declaration (optional; resolved from appInfoId/appId)" },
              appId: { type: "string", description: "The ID of the app" },
              appInfoId: { type: "string", description: "The ID of the app info" },
              attributes: { type: "object", description: "Age rating attributes to set", additionalProperties: true }
            },
            required: ["attributes"]
          }
        },
        {
          name: "list_app_categories",
          description: "List top-level App Store categories with their subcategory IDs (e.g. GAMES → GAMES_CARD, GAMES_CASUAL)",
          inputSchema: {
            type: "object",
            properties: {
              platform: { type: "string", enum: ["IOS", "MAC_OS", "TV_OS", "VISION_OS"], description: "Platform (default: IOS)" }
            }
          }
        },
        {
          name: "get_app_info_categories",
          description: "Get the primary/secondary categories and subcategories set on the app's editable app info",
          inputSchema: {
            type: "object",
            properties: {
              appId: { type: "string", description: "The ID of the app" },
              appInfoId: { type: "string", description: "The ID of the app info (optional, overrides appId)" }
            }
          }
        },
        {
          name: "update_app_info_categories",
          description: "Set the app's categories on its editable app info. Pass category IDs from list_app_categories; pass null to clear one (standard JSON:API, not declared in Apple's schema); an empty string is rejected. Games use primaryCategory GAMES plus up to two GAMES_* subcategories.",
          inputSchema: {
            type: "object",
            properties: {
              appId: { type: "string", description: "The ID of the app" },
              appInfoId: { type: "string", description: "The ID of the app info (optional, overrides appId)" },
              primaryCategory: { type: ["string", "null"], description: "e.g. GAMES" },
              primarySubcategoryOne: { type: ["string", "null"], description: "e.g. GAMES_CARD" },
              primarySubcategoryTwo: { type: ["string", "null"], description: "e.g. GAMES_CASUAL" },
              secondaryCategory: { type: ["string", "null"], description: "e.g. ENTERTAINMENT" },
              secondarySubcategoryOne: { type: ["string", "null"], description: "Secondary subcategory (games only)" },
              secondarySubcategoryTwo: { type: ["string", "null"], description: "Secondary subcategory (games only)" }
            }
          }
        },
        {
          name: "get_app_store_review_detail",
          description: "Get the App Review information (contact, demo account, notes) of an app store version",
          inputSchema: {
            type: "object",
            properties: {
              appStoreVersionId: { type: "string", description: "The ID of the app store version" }
            },
            required: ["appStoreVersionId"]
          }
        },
        {
          name: "create_app_store_review_detail",
          description: "Create the App Review information for an app store version (use update_app_store_review_detail if one already exists)",
          inputSchema: {
            type: "object",
            properties: {
              appStoreVersionId: { type: "string", description: "The ID of the app store version" },
              ...REVIEW_DETAIL_PROPERTIES
            },
            required: ["appStoreVersionId"]
          }
        },
        {
          name: "update_app_store_review_detail",
          description: "Update the App Review information (contact, demo account, notes)",
          inputSchema: {
            type: "object",
            properties: {
              appStoreReviewDetailId: { type: "string", description: "The ID of the app store review detail" },
              ...REVIEW_DETAIL_PROPERTIES
            },
            required: ["appStoreReviewDetailId"]
          }
        },
        {
          name: "update_app_store_version",
          description: "Update an app store version's attributes: version string, copyright, release type, earliest release date",
          inputSchema: {
            type: "object",
            properties: {
              appStoreVersionId: { type: "string", description: "The ID of the app store version" },
              versionString: { type: "string", description: "Version string, e.g. 1.0 (optional)" },
              copyright: { type: "string", description: "e.g. '2026 Your Name' (optional)" },
              releaseType: { type: "string", enum: ["MANUAL", "AFTER_APPROVAL", "SCHEDULED"], description: "How the version is released after approval (optional)" },
              earliestReleaseDate: { type: ["string", "null"], description: "ISO 8601 date-time, only with releaseType SCHEDULED (optional)" },
              downloadable: { type: "boolean", description: "Whether the version is downloadable (optional)" }
            },
            required: ["appStoreVersionId"]
          }
        },
        {
          name: "set_app_store_version_build",
          description: "Attach a processed build to an app store version",
          inputSchema: {
            type: "object",
            properties: {
              appStoreVersionId: { type: "string", description: "The ID of the app store version" },
              buildId: { type: "string", description: "The ID of the build" }
            },
            required: ["appStoreVersionId", "buildId"]
          }
        },
        {
          name: "list_app_price_points",
          description: "List the app's price points in one territory (id + customerPrice + proceeds). customerPrice '0' finds the free price point.",
          inputSchema: {
            type: "object",
            properties: {
              appId: { type: "string", description: "The ID of the app" },
              territory: { type: "string", description: "Territory ID (default: USA)" },
              customerPrice: { type: "string", description: "Only return the price point with this customer price, e.g. '0' or '0.99' (optional)" }
            },
            required: ["appId"]
          }
        },
        {
          name: "get_app_price_schedule",
          description: "Read the app's price schedule: base territory and manual prices with customer price",
          inputSchema: {
            type: "object",
            properties: {
              appId: { type: "string", description: "The ID of the app" },
              territory: { type: "string", description: "Filter manual prices to this territory (optional)" }
            },
            required: ["appId"]
          }
        },
        {
          name: "set_app_price_schedule",
          description: "Set the app's price: one manual price in the base territory (others equalized automatically). Pass free: true for a free app, or a pricePointId from list_app_price_points. Replaces the existing schedule.",
          inputSchema: {
            type: "object",
            properties: {
              appId: { type: "string", description: "The ID of the app" },
              free: { type: "boolean", description: "Make the app free (looks up the 0.00 price point)" },
              pricePointId: { type: "string", description: "Price point ID in the base territory" },
              baseTerritory: { type: "string", description: "Base territory ID (default: USA)" },
              startDate: { type: "string", description: "Start date YYYY-MM-DD (optional; default: effective immediately)" }
            },
            required: ["appId"]
          }
        },
        {
          name: "get_app_availability",
          description: "Read the app's territory availability: availableInNewTerritories, counts, unavailable territories, contentStatus counts, and territory availability details (ID, available, contentStatuses) for the unavailable territories or the ones requested. Use the IDs with update_territory_availability.",
          inputSchema: {
            type: "object",
            properties: {
              appId: { type: "string", description: "The ID of the app" },
              territories: { type: "array", items: { type: "string" }, description: "Return details for these territory IDs instead of the unavailable ones, e.g. ['USA', 'CHN'] (optional)" }
            },
            required: ["appId"]
          }
        },
        {
          name: "set_app_availability",
          description: "Create the app's territory availability (POST /v2/appAvailabilities), listing every territory with available true/false. Give territoryIds, or excludeTerritoryIds to sell everywhere except those (e.g. ['CHN']). Only for an app with no availability yet; once it exists, change single territories with update_territory_availability.",
          inputSchema: {
            type: "object",
            properties: {
              appId: { type: "string", description: "The ID of the app" },
              availableInNewTerritories: { type: "boolean", description: "Automatically make available in territories Apple adds later" },
              territoryIds: { type: "array", items: { type: "string" }, description: "Territory IDs to sell in (optional)" },
              excludeTerritoryIds: { type: "array", items: { type: "string" }, description: "Territory IDs to leave out, e.g. ['CHN'] (optional)" }
            },
            required: ["appId", "availableInNewTerritories"]
          }
        },
        {
          name: "update_territory_availability",
          description: "Change the app's availability in one territory (ID from get_app_availability)",
          inputSchema: {
            type: "object",
            properties: {
              territoryAvailabilityId: { type: "string", description: "The ID of the territory availability" },
              available: { type: "boolean", description: "Sell in this territory (optional)" },
              releaseDate: { type: ["string", "null"], description: "Release date YYYY-MM-DD for pre-orders (optional)" },
              preOrderEnabled: { type: "boolean", description: "Enable pre-orders (optional)" }
            },
            required: ["territoryAvailabilityId"]
          }
        },

        // Bundle ID Tools
        {
          name: "create_bundle_id",
          description: "Register a new bundle ID for app development",
          inputSchema: {
            type: "object",
            properties: {
              identifier: {
                type: "string",
                description: "The bundle ID string (e.g., 'com.example.app')"
              },
              name: {
                type: "string",
                description: "A name for the bundle ID"
              },
              platform: {
                type: "string",
                enum: ["IOS", "MAC_OS", "UNIVERSAL"],
                description: "The platform for this bundle ID"
              },
              seedId: {
                type: "string",
                description: "Your team's seed ID (optional)"
              }
            },
            required: ["identifier", "name", "platform"]
          }
        },
        {
          name: "list_bundle_ids",
          description: "Find and list bundle IDs that are registered to your team",
          inputSchema: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Maximum number of bundle IDs to return (default: 100, max: 200)",
                minimum: 1,
                maximum: 200
              },
              sort: {
                type: "string",
                description: "Sort order for the results",
                enum: [
                  "name", "-name", "platform", "-platform", 
                  "identifier", "-identifier", "seedId", "-seedId", "id", "-id"
                ]
              },
              filter: {
                type: "object",
                properties: {
                  identifier: { type: "string", description: "Filter by bundle identifier" },
                  name: { type: "string", description: "Filter by name" },
                  platform: { 
                    type: "string", 
                    description: "Filter by platform",
                    enum: ["IOS", "MAC_OS", "UNIVERSAL"]
                  },
                  seedId: { type: "string", description: "Filter by seed ID" }
                }
              },
              include: {
                type: "array",
                items: {
                  type: "string",
                  enum: ["profiles", "bundleIdCapabilities", "app"]
                },
                description: "Related resources to include in the response"
              }
            }
          }
        },
        {
          name: "get_bundle_id_info",
          description: "Get detailed information about a specific bundle ID",
          inputSchema: {
            type: "object",
            properties: {
              bundleIdId: {
                type: "string",
                description: "The ID of the bundle ID to get information for"
              },
              include: {
                type: "array",
                items: {
                  type: "string",
                  enum: ["profiles", "bundleIdCapabilities", "app"]
                },
                description: "Optional relationships to include in the response"
              },
              fields: {
                type: "object",
                properties: {
                  bundleIds: {
                    type: "array",
                    items: {
                      type: "string",
                      enum: ["name", "platform", "identifier", "seedId"]
                    },
                    description: "Fields to include for the bundle ID"
                  }
                },
                description: "Specific fields to include in the response"
              }
            },
            required: ["bundleIdId"]
          }
        },
        {
          name: "enable_bundle_capability",
          description: "Enable a capability for a bundle ID",
          inputSchema: {
            type: "object",
            properties: {
              bundleIdId: {
                type: "string",
                description: "The ID of the bundle ID"
              },
              capabilityType: {
                type: "string",
                description: "The type of capability to enable",
                enum: [
                  "ICLOUD", "IN_APP_PURCHASE", "GAME_CENTER", "PUSH_NOTIFICATIONS", "WALLET",
                  "INTER_APP_AUDIO", "MAPS", "ASSOCIATED_DOMAINS", "PERSONAL_VPN", "APP_GROUPS",
                  "HEALTHKIT", "HOMEKIT", "WIRELESS_ACCESSORY_CONFIGURATION", "APPLE_PAY",
                  "DATA_PROTECTION", "SIRIKIT", "NETWORK_EXTENSIONS", "MULTIPATH", "HOT_SPOT",
                  "NFC_TAG_READING", "CLASSKIT", "AUTOFILL_CREDENTIAL_PROVIDER", "ACCESS_WIFI_INFORMATION",
                  "NETWORK_CUSTOM_PROTOCOL", "COREMEDIA_HLS_LOW_LATENCY", "SYSTEM_EXTENSION_INSTALL",
                  "USER_MANAGEMENT", "APPLE_ID_AUTH"
                ]
              },
              settings: {
                type: "array",
                description: "Optional capability settings",
                items: {
                  type: "object",
                  properties: {
                    key: { type: "string", description: "The setting key" },
                    options: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          key: { type: "string" },
                          enabled: { type: "boolean" }
                        }
                      }
                    }
                  }
                }
              }
            },
            required: ["bundleIdId", "capabilityType"]
          }
        },
        {
          name: "disable_bundle_capability",
          description: "Disable a capability for a bundle ID",
          inputSchema: {
            type: "object",
            properties: {
              capabilityId: {
                type: "string",
                description: "The ID of the capability to disable"
              }
            },
            required: ["capabilityId"]
          }
        },

        // Device Management Tools
        {
          name: "list_devices",
          description: "Get a list of all devices registered to your team",
          inputSchema: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Maximum number of devices to return (default: 100, max: 200)",
                minimum: 1,
                maximum: 200
              },
              sort: {
                type: "string",
                description: "Sort order for the results",
                enum: [
                  "name", "-name", "platform", "-platform", "status", "-status",
                  "udid", "-udid", "deviceClass", "-deviceClass", "model", "-model",
                  "addedDate", "-addedDate"
                ]
              },
              filter: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Filter by device name" },
                  platform: { 
                    type: "string", 
                    description: "Filter by platform",
                    enum: ["IOS", "MAC_OS"]
                  },
                  status: { 
                    type: "string", 
                    description: "Filter by status",
                    enum: ["ENABLED", "DISABLED"]
                  },
                  udid: { type: "string", description: "Filter by device UDID" },
                  deviceClass: { 
                    type: "string", 
                    description: "Filter by device class",
                    enum: ["APPLE_WATCH", "IPAD", "IPHONE", "IPOD", "APPLE_TV", "MAC"]
                  }
                }
              },
              fields: {
                type: "object",
                properties: {
                  devices: {
                    type: "array",
                    items: {
                      type: "string",
                      enum: ["name", "platform", "udid", "deviceClass", "status", "model", "addedDate"]
                    },
                    description: "Fields to include for each device"
                  }
                }
              }
            }
          }
        },

        // User Management Tools
        {
          name: "list_users",
          description: "Get a list of all users registered on your App Store Connect team",
          inputSchema: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Maximum number of users to return (default: 100, max: 200)",
                minimum: 1,
                maximum: 200
              },
              sort: {
                type: "string",
                description: "Sort order for the results",
                enum: ["username", "-username", "firstName", "-firstName", "lastName", "-lastName", "roles", "-roles"]
              },
              filter: {
                type: "object",
                properties: {
                  username: { type: "string", description: "Filter by username" },
                  roles: {
                    type: "array",
                    items: {
                      type: "string",
                      enum: [
                        "ADMIN", "FINANCE", "TECHNICAL", "SALES", "MARKETING", "DEVELOPER",
                        "ACCOUNT_HOLDER", "READ_ONLY", "APP_MANAGER", "ACCESS_TO_REPORTS", "CUSTOMER_SUPPORT"
                      ]
                    },
                    description: "Filter by user roles"
                  },
                  visibleApps: {
                    type: "array",
                    items: { type: "string" },
                    description: "Filter by apps the user can see (app IDs)"
                  }
                }
              },
              include: {
                type: "array",
                items: {
                  type: "string",
                  enum: ["visibleApps"]
                },
                description: "Related resources to include in the response"
              }
            }
          }
        },

        // Analytics & Reports Tools
        {
          name: "create_analytics_report_request",
          description: "Create a new analytics report request for an app",
          inputSchema: {
            type: "object",
            properties: {
              appId: {
                type: "string",
                description: "The ID of the app to generate analytics reports for"
              },
              accessType: {
                type: "string",
                enum: ["ONGOING", "ONE_TIME_SNAPSHOT"],
                description: "Access type for the analytics report (ONGOING for daily data, ONE_TIME_SNAPSHOT for historical data)",
                default: "ONE_TIME_SNAPSHOT"
              }
            },
            required: ["appId"]
          }
        },
        {
          name: "list_analytics_reports",
          description: "Get available analytics reports for a specific report request",
          inputSchema: {
            type: "object",
            properties: {
              reportRequestId: {
                type: "string",
                description: "The ID of the analytics report request"
              },
              limit: {
                type: "number",
                description: "Maximum number of reports to return (default: 100)",
                minimum: 1,
                maximum: 200
              },
              filter: {
                type: "object",
                properties: {
                  category: {
                    type: "string",
                    enum: ["APP_STORE_ENGAGEMENT", "COMMERCE", "APP_USAGE", "FRAMEWORK_USAGE", "PERFORMANCE"],
                    description: "Filter by report category"
                  }
                }
              }
            },
            required: ["reportRequestId"]
          }
        },
        {
          name: "list_analytics_report_requests",
          description: "List existing analytics report requests for an app (check before creating; only one ONGOING request is allowed per app)",
          inputSchema: {
            type: "object",
            properties: {
              appId: {
                type: "string",
                description: "The ID of the app"
              }
            },
            required: ["appId"]
          }
        },
        {
          name: "list_analytics_report_instances",
          description: "List generated instances (daily/weekly/monthly files) of an analytics report. Flow: request -> reports -> instances -> segments -> download",
          inputSchema: {
            type: "object",
            properties: {
              reportId: {
                type: "string",
                description: "The ID of the analytics report (from list_analytics_reports)"
              },
              granularity: {
                type: "string",
                enum: ["DAILY", "WEEKLY", "MONTHLY"],
                description: "Filter by granularity"
              },
              processingDate: {
                type: "string",
                description: "Filter by processing date, YYYY-MM-DD"
              },
              limit: {
                type: "number",
                description: "Maximum number of instances to return (default: 100)",
                minimum: 1,
                maximum: 200
              }
            },
            required: ["reportId"]
          }
        },
        {
          name: "list_analytics_report_segments",
          description: "Get segments of an analytics report instance (contains download URLs)",
          inputSchema: {
            type: "object",
            properties: {
              instanceId: {
                type: "string",
                description: "The ID of the analytics report instance (from list_analytics_report_instances)"
              },
              limit: {
                type: "number",
                description: "Maximum number of segments to return (default: 100)",
                minimum: 1,
                maximum: 200
              }
            },
            required: ["instanceId"]
          }
        },
        {
          name: "download_analytics_report_segment",
          description: "Download an analytics report segment and return it as TSV text (gzip is decompressed)",
          inputSchema: {
            type: "object",
            properties: {
              segmentUrl: {
                type: "string",
                description: "The URL of the analytics report segment to download"
              },
              maxChars: {
                type: "number",
                description: "Truncate the returned text to this many characters (default: 50000)"
              }
            },
            required: ["segmentUrl"]
          }
        },

        // Xcode Development Tools
        {
          name: "list_schemes",
          description: "List all available schemes in an Xcode project or workspace",
          inputSchema: {
            type: "object",
            properties: {
              projectPath: {
                type: "string",
                description: "Path to the Xcode project (.xcodeproj) or workspace (.xcworkspace)"
              }
            },
            required: ["projectPath"]
          }
        }
    ];

    // Sales and Finance Report tools - only available if vendor number is configured
    const paymentReportTools = [
      {
        name: "download_sales_report",
        description: "Download sales and trends reports",
        inputSchema: {
          type: "object",
          properties: {
            vendorNumber: {
              type: "string",
              description: "Your vendor number from App Store Connect (optional if set as environment variable)",
              default: config.vendorNumber
            },
            reportType: {
              type: "string",
              enum: ["SALES"],
              description: "Type of report to download",
              default: "SALES"
            },
            reportSubType: {
              type: "string",
              enum: ["SUMMARY", "DETAILED"],
              description: "Sub-type of the report",
              default: "SUMMARY"
            },
            frequency: {
              type: "string",
              enum: ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"],
              description: "Frequency of the report",
              default: "MONTHLY"
            },
            reportDate: {
              type: "string",
              description: "Report date in YYYY-MM format (e.g., '2024-01')"
            }
          },
          required: ["reportDate"]
        }
      },
      {
        name: "download_finance_report",
        description: "Download finance reports for a specific region",
        inputSchema: {
          type: "object",
          properties: {
            vendorNumber: {
              type: "string",
              description: "Your vendor number from App Store Connect (optional if set as environment variable)",
              default: config.vendorNumber
            },
            reportDate: {
              type: "string",
              description: "Report date in YYYY-MM format (e.g., '2024-01')"
            },
            regionCode: {
              type: "string",
              description: "Region code (e.g., 'Z1' for worldwide, 'WW' for Europe)"
            }
          },
          required: ["reportDate", "regionCode"]
        }
      }
    ];

    // Only include payment report tools if vendor number is configured
    if (config.vendorNumber) {
      return [...baseTools, ...paymentReportTools];
    }

    return baseTools;
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.buildToolsList()
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const args = request.params.arguments || {};
        
        // Helper to format responses
        const formatResponse = (data: any) => {
          return {
            content: [{
              type: "text",
              text: JSON.stringify(data, null, 2)
            }]
          };
        };
        
        switch (request.params.name) {
          // App Management
          case "list_apps":
            const appsData = await this.appHandlers.listApps(args as any);
            return formatResponse(appsData);
          
          case "get_app_info":
            const appInfo = await this.appHandlers.getAppInfo(args as any);
            return formatResponse(appInfo);

          // Beta Testing
          case "list_beta_groups":
            return formatResponse(await this.betaHandlers.listBetaGroups(args as any));
          
          case "list_group_testers":
            return formatResponse(await this.betaHandlers.listGroupTesters(args as any));
          
          case "add_tester_to_group":
            return formatResponse(await this.betaHandlers.addTesterToGroup(args as any));
          
          case "remove_tester_from_group":
            return formatResponse(await this.betaHandlers.removeTesterFromGroup(args as any));
          
          case "list_beta_feedback_screenshots":
            const feedbackData = await this.betaHandlers.listBetaFeedbackScreenshots(args as any);
            return formatResponse(feedbackData);
          
          case "get_beta_feedback_screenshot":
            const result = await this.betaHandlers.getBetaFeedbackScreenshot(args as any);
            // If the result already contains content (image), return it directly
            if (result.content) {
              return result;
            }
            // Otherwise format as text
            return formatResponse(result);

          // App Store Version Localizations
          case "create_app_store_version":
            return formatResponse(await this.localizationHandlers.createAppStoreVersion(args as any));
          
          case "list_app_store_versions":
            return formatResponse(await this.localizationHandlers.listAppStoreVersions(args as any));
          
          case "list_app_store_version_localizations":
            return formatResponse(await this.localizationHandlers.listAppStoreVersionLocalizations(args as any));
          
          case "get_app_store_version_localization":
            return formatResponse(await this.localizationHandlers.getAppStoreVersionLocalization(args as any));
          
          case "update_app_store_version_localization":
            return formatResponse(await this.localizationHandlers.updateAppStoreVersionLocalization(args as any));
          
          case "create_app_store_version_localization":
            return formatResponse(await this.localizationHandlers.createAppStoreVersionLocalization(args as any));

          // App Info Localizations
          case "list_app_info_localizations":
            return formatResponse(await this.localizationHandlers.listAppInfoLocalizations(args as any));
          
          case "create_app_info_localization":
            return formatResponse(await this.localizationHandlers.createAppInfoLocalization(args as any));
          
          case "update_app_info_localization":
            return formatResponse(await this.localizationHandlers.updateAppInfoLocalization(args as any));

          // App Screenshots
          case "list_app_screenshot_sets":
            return formatResponse(await this.screenshotHandlers.listAppScreenshotSets(args as any));
          
          case "create_app_screenshot_set":
            return formatResponse(await this.screenshotHandlers.createAppScreenshotSet(args as any));
          
          case "list_app_screenshots":
            return formatResponse(await this.screenshotHandlers.listAppScreenshots(args as any));
          
          case "delete_app_screenshot":
            return formatResponse(await this.screenshotHandlers.deleteAppScreenshot(args as any));
          
          case "upload_app_screenshot":
            return formatResponse(await this.screenshotHandlers.uploadAppScreenshot(args as any));

          // Asset Library
          case "get_asset_library_ref_data":
            return formatResponse(await this.assetLibraryHandlers.getAssetLibraryRefData(args as any));

          case "list_asset_library_media":
            return formatResponse(await this.assetLibraryHandlers.listAssetLibraryMedia(args as any));

          case "upload_asset_library_media":
            return formatResponse(await this.assetLibraryHandlers.uploadAssetLibraryMedia(args as any));

          case "create_asset_placement":
            return formatResponse(await this.assetLibraryHandlers.createAssetPlacement(args as any));

          case "list_asset_placements":
            return formatResponse(await this.assetLibraryHandlers.listLocalizationPlacements(args as any));

          case "reorder_asset_placements":
            return formatResponse(await this.assetLibraryHandlers.reorderAssetPlacements(args as any));

          case "delete_asset_placement":
            return formatResponse(await this.assetLibraryHandlers.deleteAssetPlacement(args as any));

          case "delete_asset_library_media":
            return formatResponse(await this.assetLibraryHandlers.deleteAssetLibraryMedia(args as any));

          // In-App Purchases
          case "list_in_app_purchases":
            return formatResponse(await this.inAppPurchaseHandlers.listInAppPurchases(args as any));

          case "get_in_app_purchase":
            return formatResponse(await this.inAppPurchaseHandlers.getInAppPurchase(args as any));

          case "create_in_app_purchase":
            return formatResponse(await this.inAppPurchaseHandlers.createInAppPurchase(args as any));

          case "update_in_app_purchase":
            return formatResponse(await this.inAppPurchaseHandlers.updateInAppPurchase(args as any));

          case "delete_in_app_purchase":
            return formatResponse(await this.inAppPurchaseHandlers.deleteInAppPurchase(args as any));

          case "list_in_app_purchase_versions":
            return formatResponse(await this.inAppPurchaseHandlers.listInAppPurchaseVersions(args as any));

          case "create_in_app_purchase_version":
            return formatResponse(await this.inAppPurchaseHandlers.createInAppPurchaseVersion(args as any));

          case "list_in_app_purchase_localizations":
            return formatResponse(await this.inAppPurchaseHandlers.listInAppPurchaseLocalizations(args as any));

          case "create_in_app_purchase_localization":
            return formatResponse(await this.inAppPurchaseHandlers.createInAppPurchaseLocalization(args as any));

          case "update_in_app_purchase_localization":
            return formatResponse(await this.inAppPurchaseHandlers.updateInAppPurchaseLocalization(args as any));

          case "delete_in_app_purchase_localization":
            return formatResponse(await this.inAppPurchaseHandlers.deleteInAppPurchaseLocalization(args as any));

          case "list_in_app_purchase_price_points":
            return formatResponse(await this.inAppPurchaseHandlers.listInAppPurchasePricePoints(args as any));

          case "set_in_app_purchase_price":
            return formatResponse(await this.inAppPurchaseHandlers.setInAppPurchasePrice(args as any));

          case "get_in_app_purchase_price_schedule":
            return formatResponse(await this.inAppPurchaseHandlers.getInAppPurchasePriceSchedule(args as any));

          case "get_in_app_purchase_availability":
            return formatResponse(await this.inAppPurchaseHandlers.getInAppPurchaseAvailability(args as any));

          case "set_in_app_purchase_availability":
            return formatResponse(await this.inAppPurchaseHandlers.setInAppPurchaseAvailability(args as any));

          case "upload_in_app_purchase_review_screenshot":
            return formatResponse(await this.inAppPurchaseHandlers.uploadInAppPurchaseReviewScreenshot(args as any));

          // Listing (age rating, categories, review detail, version, price, availability)
          case "list_territories":
            return formatResponse(await this.listingHandlers.listTerritories(args as any));

          case "get_age_rating_declaration":
            return formatResponse(await this.listingHandlers.getAgeRatingDeclaration(args as any));

          case "update_age_rating_declaration":
            return formatResponse(await this.listingHandlers.updateAgeRatingDeclaration(args as any));

          case "list_app_categories":
            return formatResponse(await this.listingHandlers.listAppCategories(args as any));

          case "get_app_info_categories":
            return formatResponse(await this.listingHandlers.getAppInfoCategories(args as any));

          case "update_app_info_categories":
            return formatResponse(await this.listingHandlers.updateAppInfoCategories(args as any));

          case "get_app_store_review_detail":
            return formatResponse(await this.listingHandlers.getAppStoreReviewDetail(args as any));

          case "create_app_store_review_detail":
            return formatResponse(await this.listingHandlers.createAppStoreReviewDetail(args as any));

          case "update_app_store_review_detail":
            return formatResponse(await this.listingHandlers.updateAppStoreReviewDetail(args as any));

          case "update_app_store_version":
            return formatResponse(await this.listingHandlers.updateAppStoreVersion(args as any));

          case "set_app_store_version_build":
            return formatResponse(await this.listingHandlers.setAppStoreVersionBuild(args as any));

          case "list_app_price_points":
            return formatResponse(await this.listingHandlers.listAppPricePoints(args as any));

          case "get_app_price_schedule":
            return formatResponse(await this.listingHandlers.getAppPriceSchedule(args as any));

          case "set_app_price_schedule":
            return formatResponse(await this.listingHandlers.setAppPriceSchedule(args as any));

          case "get_app_availability":
            return formatResponse(await this.listingHandlers.getAppAvailability(args as any));

          case "set_app_availability":
            return formatResponse(await this.listingHandlers.setAppAvailability(args as any));

          case "update_territory_availability":
            return formatResponse(await this.listingHandlers.updateTerritoryAvailability(args as any));

          // Bundle IDs
          case "create_bundle_id":
            return formatResponse(await this.bundleHandlers.createBundleId(args as any));
          
          case "list_bundle_ids":
            return formatResponse(await this.bundleHandlers.listBundleIds(args as any));
          
          case "get_bundle_id_info":
            return formatResponse(await this.bundleHandlers.getBundleIdInfo(args as any));
          
          case "enable_bundle_capability":
            return formatResponse(await this.bundleHandlers.enableBundleCapability(args as any));
          
          case "disable_bundle_capability":
            return formatResponse(await this.bundleHandlers.disableBundleCapability(args as any));

          // Devices
          case "list_devices":
            return formatResponse(await this.deviceHandlers.listDevices(args as any));

          // Users
          case "list_users":
            return formatResponse(await this.userHandlers.listUsers(args as any));

          // Analytics & Reports
          case "create_analytics_report_request":
            return formatResponse(await this.analyticsHandlers.createAnalyticsReportRequest(args as any));
          
          case "list_analytics_reports":
            return formatResponse(await this.analyticsHandlers.listAnalyticsReports(args as any));
          
          case "list_analytics_report_requests":
            return formatResponse(await this.analyticsHandlers.listAnalyticsReportRequests(args as any));

          case "list_analytics_report_instances":
            return formatResponse(await this.analyticsHandlers.listAnalyticsReportInstances(args as any));

          case "list_analytics_report_segments":
            return formatResponse(await this.analyticsHandlers.listAnalyticsReportSegments(args as any));
          
          case "download_analytics_report_segment":
            return formatResponse(await this.analyticsHandlers.downloadAnalyticsReportSegment(args as any));
          
          case "download_sales_report":
            if (!config.vendorNumber) {
              throw new McpError(
                ErrorCode.MethodNotFound,
                "Sales reports are not available. Please set APP_STORE_CONNECT_VENDOR_NUMBER environment variable."
              );
            }
            return formatResponse(await this.analyticsHandlers.downloadSalesReport(args as any));
          
          case "download_finance_report":
            if (!config.vendorNumber) {
              throw new McpError(
                ErrorCode.MethodNotFound,
                "Finance reports are not available. Please set APP_STORE_CONNECT_VENDOR_NUMBER environment variable."
              );
            }
            return formatResponse(await this.analyticsHandlers.downloadFinanceReport(args as any));

          // Xcode Development Tools
          case "list_schemes":
            return formatResponse(await this.xcodeHandlers.listSchemes(args as any));

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          throw new McpError(
            ErrorCode.InternalError,
            `App Store Connect API error: ${error.response?.data?.errors?.[0]?.detail ?? error.message}`
          );
        }
        throw error;
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("App Store Connect MCP server running on stdio");
  }
}

// Start the server
const server = new AppStoreConnectServer();
server.run().catch(console.error);