import { Construct } from "constructs";
import { App, AzurermBackend, TerraformOutput, TerraformStack } from "cdktf";

import {
  LinuxWebApp,
  ServicePlan,
  ApplicationInsights,
  ApplicationInsightsWebTest,
  AppServiceSiteConfigScmIpRestriction,
  AppServiceVirtualNetworkSwiftConnection,
  AzurermProvider,
  DataAzurermClientConfig,
  DataAzurermResourceGroup,
  Frontdoor,
  FrontdoorFirewallPolicy,
  KeyVault,
  KeyVaultAccessPolicyA,
  KeyVaultSecret,
  LogAnalyticsWorkspace,
  MonitorActionGroup,
  MonitorAutoscaleSetting,
  MonitorMetricAlert,
  MonitorPrivateLinkScope,
  MonitorPrivateLinkScopedService,
  PostgresqlServer,
  PostgresqlVirtualNetworkRule,
  PrivateDnsZone,
  PrivateDnsZoneVirtualNetworkLink,
  PrivateEndpoint,
  ServicebusNamespace,
  ServicebusNamespaceNetworkRuleSet,
  ServicebusQueue,
  StorageAccount,
  Subnet,
  VirtualNetwork
} from "./.gen/providers/azurerm";

import { RandomProvider, Password } from "@cdktf/provider-random";

import { DnsConfig } from "./interface";
import { Application, ApplicationPassword, AzureadProvider } from "@cdktf/provider-azuread";
import { Rotating, TimeProvider } from "./.gen/providers/time";

require('dotenv').config();

class MyStack extends TerraformStack {
  //constructor(scope: Construct, name: string, config: { [key: string]: string }) {
  constructor(scope: Construct, name: string) {
    super(scope, name);

    // Different providers
    new AzurermProvider(this, "AzureRm", {
      // partnerId: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      features: {},
      skipProviderRegistration: true,
    });

    new AzureadProvider(this, "azuread", {});
    new RandomProvider(this, "random", {});
    new TimeProvider(this, "time", {});

    // Terraform backend in a manually created Storage Account
    new AzurermBackend(this, {
      resourceGroupName: `${process.env.RESOURCEGROUPNAME}`,
      storageAccountName: `501cdkpocstate${process.env.ENVNAME}${process.env.STAGE}`,
      containerName: "tfstate",
      key: `${process.env.STAGE}.terraform.tfstate`,
    });

    // Current user info
    const currentUser = new DataAzurermClientConfig(this, "currentuser", {})

    // List of allowed IP addresses
    const allowedIpAddresses = [
      "81.22.162.228/32", // Office IP      
      "81.22.169.199/32", // Telescope IP
    ]

    // User to be added to action group
    const alertedUser = "firstname.lastname@cgi.com";

    // Resource group that is previously created
    const rg = new DataAzurermResourceGroup(this, "ResourceGroup", {
      name: `${process.env.RESOURCEGROUPNAME}`
    });

    const vnet = new VirtualNetwork(this, "Vnet", {
      name: `501-cdk-vnet-${process.env.ENVNAME}-${process.env.STAGE}`,
      resourceGroupName: rg.name,
      location: rg.location,
      addressSpace: ["10.1.0.0/22"]
    });

    const appSubnet = new Subnet(this, "WebAppSubnet", {
      name: `501-cdk-subnet-app-${process.env.ENVNAME}-${process.env.STAGE}`,
      resourceGroupName: rg.name,
      virtualNetworkName: vnet.name,
      addressPrefixes: [
        "10.1.0.0/24"
      ],
      serviceEndpoints: [
        "Microsoft.Sql",
        "Microsoft.KeyVault"
      ],
      delegation: [{
        name: "webapp-delegation",
        serviceDelegation: {
          name: "Microsoft.Web/serverFarms",
          actions: ["Microsoft.Network/virtualNetworks/subnets/action"]
        }
      }]
    });

    const plSubnet = new Subnet(this, "PrivateLinkSubnet", {
      name: `501-cdk-subnet-pl-${process.env.ENVNAME}-${process.env.STAGE}`,
      resourceGroupName: rg.name,
      virtualNetworkName: vnet.name,
      addressPrefixes: [
        "10.1.1.0/25"
      ],
      serviceEndpoints: [
        "Microsoft.Sql",
        "Microsoft.KeyVault"
      ],
      enforcePrivateLinkEndpointNetworkPolicies: true
    });

    const keyVault = new KeyVault(this, "KeyVault", {
      name: `kv501cdk${process.env.ENVNAME}${process.env.STAGE}`,
      location: rg.location,
      resourceGroupName: rg.name,
      skuName: "standard",
      tenantId: currentUser.tenantId,
      enabledForDeployment: true,
      enabledForDiskEncryption: true,
      enabledForTemplateDeployment: true,
      // softDeleteEnabled: true,
      softDeleteRetentionDays: 90,
      purgeProtectionEnabled: false, // TODO: Should be enabled, but causes problems during multiple destroy/deploy cycles!!

      networkAcls: {
        bypass: "AzureServices",
        defaultAction: "Deny",
        virtualNetworkSubnetIds: [appSubnet.id],
        ipRules: allowedIpAddresses
      },
    })

    const currentUserAccess = new KeyVaultAccessPolicyA(this, "CurrentuserPolicy", {
      keyVaultId: keyVault.id,
      tenantId: currentUser.tenantId,
      objectId: currentUser.objectId,

      secretPermissions: ["Get", "Set", "List", "Delete", "Purge"]
    })

    const staticWebsiteSA = new StorageAccount(this, "StaticWebsiteStorageAccount", {
      name: `501cdk${process.env.ENVNAME}${process.env.STAGE}`,
      resourceGroupName: rg.name,
      location: rg.location,
      accountTier: "Standard",
      accountReplicationType: "LRS",
      accountKind: "StorageV2",
      enableHttpsTrafficOnly: true,
      minTlsVersion: "TLS1_2",
      allowNestedItemsToBePublic: true,
      staticWebsite: {
        indexDocument: "index.html",
      }
    });

    const postgrePassword = new Password(this, "PasswordPostgresqlAdmin", {
      length: 32,
      minLower: 3,
      minNumeric: 3,
      minSpecial: 3,
      minUpper: 3
    })

    const postgrePasswordSecretKey = new KeyVaultSecret(this, "KeyvaultSecretDbPassword", {
      keyVaultId: keyVault.id,
      name: "postgre-password",
      value: postgrePassword.result,
      dependsOn: [currentUserAccess] // Create only after current user has permissions
    })

    const psqlServer = new PostgresqlServer(this, "PostgreSqlServer", {
      name: `501-cdk-psql-${process.env.ENVNAME}-${process.env.STAGE}`,
      administratorLogin: process.env.POSTGREUSERNAME ?? "postgreAdmin",
      administratorLoginPassword: postgrePassword.result,
      resourceGroupName: rg.name,
      geoRedundantBackupEnabled: false,
      location: rg.location,
      version: "11",
      skuName: "GP_Gen5_2",
      sslEnforcementEnabled: true,
      sslMinimalTlsVersionEnforced: "TLS1_2"
    });

    const frontDoorWaf = new FrontdoorFirewallPolicy(this, "FrontDoorWaf", {
      name: `cdktfwaf${process.env.ENVNAME}${process.env.STAGE}`,
      resourceGroupName: rg.name,
      enabled: true,
      mode: "Prevention",
      customBlockResponseStatusCode: 403,

      managedRule: [
        {
          type: "DefaultRuleSet",
          version: "1.0",
        },
        {
          type: "Microsoft_BotManagerRuleSet",
          version: "1.0",
        }
      ],
    });

    const frontDoor = new Frontdoor(this, "Frontdoor", {
      name: `cdktf-frontdoor-${process.env.ENVNAME}-${process.env.STAGE}`,
      resourceGroupName: rg.name,

      backendPoolSettings: [
        {
          enforceBackendPoolsCertificateNameCheck: false
        }
      ],

      backendPoolHealthProbe: [
        {
          name: `cdktf-backend-api-pool-health-${process.env.STAGE}`,
          probeMethod: "HEAD",
          protocol: "Https"
        },
        {
          name: `cdktf-backend-pool-health-${process.env.STAGE}`,
          probeMethod: "HEAD",
          protocol: "Https"
        },
      ],
      backendPoolLoadBalancing: [
        { name: `cdktf-backend-api-pool-load-${process.env.STAGE}` },
        { name: `cdktf-backend-pool-load-${process.env.STAGE}` },
      ],
      frontendEndpoint: [
        {
          name: `cdktf-frontend-endpoint-${process.env.STAGE}`,
          hostName: `cdktf-frontdoor-${process.env.ENVNAME}-${process.env.STAGE}.azurefd.net`,
          webApplicationFirewallPolicyLinkId: frontDoorWaf.id
        }
      ],
      routingRule: [
        {
          name: `${staticWebsiteSA.name}-frontend-endpoint-${process.env.STAGE}`,
          acceptedProtocols: ["Https"],
          patternsToMatch: ["/*"],
          frontendEndpoints: [`cdktf-frontend-endpoint-${process.env.STAGE}`],
          forwardingConfiguration: {
            forwardingProtocol: "HttpsOnly",
            backendPoolName: `cdktf-backend-pool-${process.env.STAGE}`,
          }
        },
        {
          name: `${staticWebsiteSA.name}-api-frontend-endpoint-${process.env.STAGE}`,
          acceptedProtocols: ["Https"],
          patternsToMatch: ["/api/*"],
          frontendEndpoints: [`cdktf-frontend-endpoint-${process.env.STAGE}`],
          forwardingConfiguration: {
            forwardingProtocol: "HttpsOnly",
            backendPoolName: `cdktf-backend-api-pool-${process.env.STAGE}`,
          },
        }
      ],
      backendPool: [
        {
          name: `cdktf-backend-api-pool-${process.env.STAGE}`,
          healthProbeName: `cdktf-backend-api-pool-health-${process.env.STAGE}`,
          loadBalancingName: `cdktf-backend-api-pool-load-${process.env.STAGE}`,
          backend: [{
            hostHeader: `501-cdk-api-${process.env.ENVNAME}-${process.env.STAGE}.azurewebsites.net`,
            address: `501-cdk-api-${process.env.ENVNAME}-${process.env.STAGE}.azurewebsites.net`,
            httpPort: 80,
            httpsPort: 443
          }],
        },
        {
          name: `cdktf-backend-pool-${process.env.STAGE}`,
          healthProbeName: `cdktf-backend-pool-health-${process.env.STAGE}`,
          loadBalancingName: `cdktf-backend-pool-load-${process.env.STAGE}`,
          backend: [{
            hostHeader: staticWebsiteSA.primaryWebHost,
            address: staticWebsiteSA.primaryWebHost,
            httpPort: 80,
            httpsPort: 443
          }],
        },
      ],
    });

    // Log analytics workspace
    const law = new LogAnalyticsWorkspace(this, "LogAnalytics", {
      name: `501-cdk-law-${process.env.ENVNAME}-${process.env.STAGE}`,
      location: rg.location,
      resourceGroupName: rg.name,
      sku: "PerGB2018",
      retentionInDays: 30,
      internetIngestionEnabled: false,
      internetQueryEnabled: false
    });

    // Application insight
    const ai = new ApplicationInsights(this, "ApplicationInsights", {
      name: `501-cdk-ai-${process.env.ENVNAME}-${process.env.STAGE}`,
      location: rg.location,
      resourceGroupName: rg.name,
      workspaceId: law.id,
      applicationType: "web",
      internetIngestionEnabled: false,
      internetQueryEnabled: false
    });

    // Azure Monitor Private Link Scope
    const ampls = new MonitorPrivateLinkScope(this, "MonitorPrivateLinkScope", {
      name: `501-cdk-ampls-${process.env.ENVNAME}-${process.env.STAGE}`,
      resourceGroupName: rg.name
    });

    new MonitorPrivateLinkScopedService(this, "MonitorPrivateLinkScopeServiceAi", {
      name: `501-cdk-amplsserviceai-${process.env.ENVNAME}-${process.env.STAGE}`,
      resourceGroupName: rg.name,
      scopeName: ampls.name,
      linkedResourceId: ai.id
    });

    new MonitorPrivateLinkScopedService(this, "MonitorPrivateLinkScopeServiceLaw", {
      name: `501-cdk-amplsservicelaw-${process.env.ENVNAME}-${process.env.STAGE}`,
      resourceGroupName: rg.name,
      scopeName: ampls.name,
      linkedResourceId: law.id
    });

    // App Service Plan
    const plan = new ServicePlan(this, "AppServicePlan", {
      name: `501-cdk-plan-${process.env.ENVNAME}-${process.env.STAGE}`,
      location: rg.location,
      resourceGroupName: rg.name,
      skuName: "P1v2",
      osType: "Linux"
    });

    // Autoscaling features for App Service plan
    new MonitorAutoscaleSetting(this, "appServiceAutoscale", {
      name: `501-cdk-plan-autoscale-${process.env.ENVNAME}-${process.env.STAGE}`,
      location: rg.location,
      resourceGroupName: rg.name,
      targetResourceId: plan.id,
      profile: [{
        name: "default",
        capacity: {
          default: 1,
          minimum: 1,
          maximum: 10
        },
        rule: [
          {
            metricTrigger: {
              metricName: "CpuPercentage",
              metricResourceId: plan.id,
              timeGrain: "PT1M",
              statistic: "Average",
              timeWindow: "PT3M",
              timeAggregation: "Average",
              operator: "GreaterThan",
              threshold: 65
            },
            scaleAction: {
              direction: "Increase",
              type: "ChangeCount",
              value: 2,
              cooldown: "PT3M"
            }
          },
          {
            metricTrigger: {
              metricName: "CpuPercentage",
              metricResourceId: plan.id,
              timeGrain: "PT1M",
              statistic: "Average",
              timeWindow: "PT15M",
              timeAggregation: "Average",
              operator: "LessThan",
              threshold: 25,
            },
            scaleAction: {
              direction: "Decrease",
              type: "ChangeCount",
              value: 1,
              cooldown: "PT5M"
            }
          }
        ]
      }]
    });

    // App registration for Api AppService
    const appRegistration = new Application(this, "ApiAppServiceRegistration", {
      displayName: `501-cdk-application-${process.env.ENVNAME}-${process.env.STAGE}`,
      owners: [currentUser.objectId],
      signInAudience: "AzureADMyOrg",
      oauth2PostResponseRequired: false,

      requiredResourceAccess: [
        {
          resourceAppId: "00000003-0000-0000-c000-000000000000", //MS Graph
          resourceAccess: [
            {
              id: "e1fe6dd8-ba31-4d61-89e7-88639da4683d", // Sign in and read user profile
              type: "Scope"
            }
          ]
        }
      ],

      api: {
        oauth2PermissionScope: [
          {
            id: "013591a5-82d8-4c74-84a9-ae89a2d70baf", // TODO Tähän joku ID??
            adminConsentDisplayName: "Access 501-cdk-api-jyrki-dev",
            adminConsentDescription: "Allow the application to access 501-cdk-api-jyrki-dev on behalf of the signed-in user.",
            enabled: true,
            type: "User",
            userConsentDisplayName: "Access 501-cdk-api-jyrki-dev",
            userConsentDescription: "Allow the application to access 501-cdk-api-jyrki-dev on your behalf.",
            value: "user_impersonation"
          }
        ],
      },

      optionalClaims: {
        idToken: [
          {
            name: "email",
            source: "user",
            essential: true,
            additionalProperties: ["emit_as_roles"]
          }
        ]
      }
    });

    // Rotation for secret key
    const rotation = new Rotating(this, "appRegistrationSecretRotate", {
      rotationYears: 1
    })

    // Client secret for App registration
    const appRegistrationPassword = new ApplicationPassword(this, "ApiAppServiceRegistrationPassword", {
      applicationObjectId: appRegistration.objectId,
      rotateWhenChanged: {
        rotation: rotation.id
      }
    });

    // Create proper object for SCM restrictions
    const scmIpRestrictionsList: AppServiceSiteConfigScmIpRestriction[] = allowedIpAddresses.map((value, index) => {
      return {
        name: "AllowOnlyFromOfficeNetwork",
        priority: 100 + index,
        action: "Allow",
        ipAddress: value,
        // serviceTag: undefined, // Does not work here, see addOverride
        // virtualNetworkSubnetId: undefined, // Does not work here, see addOverride
        headers: []
      };
    });

    const apiAppService = new LinuxWebApp(this, "ApiAppService", {
      name: `501-cdk-api-${process.env.ENVNAME}-${process.env.STAGE}`,
      servicePlanId: `${plan.id}`,
      location: rg.location,
      resourceGroupName: rg.name,
      clientAffinityEnabled: false,
      httpsOnly: true,
      identity: {
        type: "SystemAssigned"
      },
      appSettings: {
        DB_DATABASE: "exampledatabase",
        DB_HOST: `${psqlServer.name}.psql.database.azure.com`,
        DB_PASSWORD: `@Microsoft.KeyVault(SecretUri=${keyVault.vaultUri}secrets/${postgrePasswordSecretKey.name}/)`,
        DB_USER: `${psqlServer.administratorLogin}@${psqlServer.name}`,
        MEDIA_ROOT_URL: `${staticWebsiteSA.id}media`,
        PORT: "3001",
        APPINSIGHTS_INSTRUMENTATIONKEY: ai.instrumentationKey,
        APPLICATIONINSIGHTS_CONNECTION_STRING: ai.connectionString,
        APPINSIGHTS_PROFILERFEATURE_VERSION: "1.0.0",
        APPINSIGHTS_SNAPSHOTFEATURE_VERSION: "1.0.0",
        SnapshotDebugger_EXTENSION_VERSION: "disabled",
        ApplicationInsightsAgent_EXTENSION_VERSION: "~3",
        DiagnosticServices_EXTENSION_VERSION: "~3",
        InstrumentationEngine_EXTENSION_VERSION: "disabled",
        XDT_MicrosoftApplicationInsights_BaseExtensions: "disabled",
        XDT_MicrosoftApplicationInsights_PreemptSdk: "disabled",
        XDT_MicrosoftApplicationInsights_Mode: "recommended"
      },
      siteConfig: {
        cors: { allowedOrigins: [`https://501-cdk-frontdoor-${process.env.STAGE}.azurefd.net`, staticWebsiteSA.primaryWebEndpoint] },
        alwaysOn: true,
        ftpsState: "Disabled",
        vnetRouteAllEnabled: true,
        applicationStack: {
          nodeVersion: "16-lts"
        },
        ipRestriction: [
          {
            name: "AllowOnlyFromFrontDoor",
            priority: 100,
            serviceTag: "AzureFrontDoor.Backend",
            action: "Allow",
            // ipAddress: undefined, // Does not work here, see addOverride
            // virtualNetworkSubnetId: undefined, // Does not work here, see addOverride
            headers: [{
              xAzureFdid: [frontDoor.headerFrontdoorId],
              xFdHealthProbe: [],
              xForwardedFor: [],
              xForwardedHost: []
            }]
          },
          {
            name: "AllowAppInsightAvailability",
            priority: 110,
            serviceTag: "ApplicationInsightsAvailability",
            action: "Allow",
            // ipAddress: undefined, // Does not work here, see addOverride
            // virtualNetworkSubnetId: undefined, // Does not work here, see addOverride
            headers: []
          }
        ],
        scmIpRestriction: scmIpRestrictionsList
      },
      authSettings: {
        enabled: true,
        issuer: `https://sts.windows.net/${currentUser.tenantId}/`,
        defaultProvider: "AzureActiveDirectory",

        unauthenticatedClientAction: "RedirectToLoginPage",
        // runtimeVersion: "~1",
        tokenStoreEnabled: true,
        activeDirectory: {
          clientId: appRegistration.applicationId,
          clientSecret: appRegistrationPassword.value,
          allowedAudiences: [
            `api://${appRegistration.applicationId}`
          ]
        }
      },
      lifecycle: {
        ignoreChanges: [
          "site_config[0].ip_restriction[0].ip_address", // Service tag is written here automatically
          "site_config[0].ip_restriction[1].ip_address" // Service tag is written here automatically
        ]
      }
    });

    // Overrides for Front door
    apiAppService.addOverride("site_config.ip_restriction.0", {
      virtual_network_subnet_id: null,
      ip_address: null
    });

    // Overrides for Front door
    apiAppService.addOverride("site_config.ip_restriction.1", {
      virtual_network_subnet_id: null,
      ip_address: null
    });

    // Overrides for SCM restrictions
    for (let i = 0; i < scmIpRestrictionsList.length; i++) {
      apiAppService.addOverride("site_config.scm_ip_restriction." + i, {
        virtual_network_subnet_id: null,
        service_tag: null
      });
    }

    // Worker App
    const workerAppService = new LinuxWebApp(this, "WorkerAppService", {
      name: `501-cdk-worker-${process.env.ENVNAME}-${process.env.STAGE}`,
      servicePlanId: `${plan.id}`,
      location: rg.location,
      resourceGroupName: rg.name,
      clientAffinityEnabled: false,
      httpsOnly: true,
      identity: {
        type: "SystemAssigned"
      },

      appSettings: {
        DB_DATABASE: "exampledatabase",
        DB_HOST: `${psqlServer.name}.psql.database.azure.com`,
        DB_PASSWORD: `@Microsoft.KeyVault(SecretUri=${keyVault.vaultUri}secrets/${postgrePasswordSecretKey.name}/)`,
        DB_USER: `${psqlServer.administratorLogin}@${psqlServer.name}`,
        MEDIA_ROOT_URL: `${staticWebsiteSA.id}media`,
        PORT: "3001",
        APPINSIGHTS_INSTRUMENTATIONKEY: ai.instrumentationKey,
        APPLICATIONINSIGHTS_CONNECTION_STRING: ai.connectionString,
        APPINSIGHTS_PROFILERFEATURE_VERSION: "1.0.0",
        APPINSIGHTS_SNAPSHOTFEATURE_VERSION: "1.0.0",
        SnapshotDebugger_EXTENSION_VERSION: "disabled",
        ApplicationInsightsAgent_EXTENSION_VERSION: "~3",
        DiagnosticServices_EXTENSION_VERSION: "~3",
        InstrumentationEngine_EXTENSION_VERSION: "disabled",
        XDT_MicrosoftApplicationInsights_BaseExtensions: "disabled",
        XDT_MicrosoftApplicationInsights_PreemptSdk: "disabled",
        XDT_MicrosoftApplicationInsights_Mode: "recommended"
      },
      siteConfig: {
        cors: { allowedOrigins: [`https://501-cdk-frontdoor-${process.env.STAGE}.azurefd.net`, staticWebsiteSA.primaryWebEndpoint] },
        alwaysOn: true,
        ftpsState: "Disabled",
        vnetRouteAllEnabled: true,
        applicationStack: {
          nodeVersion: "16-lts"
        },
        ipRestriction: [
          {
            name: "AllowOnlyFromFrontDoor",
            priority: 100,
            serviceTag: "AzureFrontDoor.Backend",
            action: "Allow",
            //ipAddress: undefined, // Does not work here, see addOverride
            // virtualNetworkSubnetId: undefined, // Does not work here, see addOverride
            headers: [{
              xAzureFdid: [frontDoor.headerFrontdoorId],
              xFdHealthProbe: [],
              xForwardedFor: [],
              xForwardedHost: []
            }]
          },
          {
            name: "AllowAppInsightAvailability",
            priority: 110,
            serviceTag: "ApplicationInsightsAvailability",
            action: "Allow",
            //ipAddress: undefined, // Does not work here, see addOverride
            // virtualNetworkSubnetId: undefined, // Does not work here, see addOverride
            headers: []
          }
        ],
        scmIpRestriction: scmIpRestrictionsList
      },
      lifecycle: {
        ignoreChanges: [
          "site_config[0].ip_restriction[0].ip_address", // Service tag is written here automatically
          "site_config[0].ip_restriction[1].ip_address" // Service tag is written here automatically
        ]
      }
    });

    // Overrides for Front door
    workerAppService.addOverride("site_config.ip_restriction.0", {
      virtual_network_subnet_id: null,
      ip_address: null
    });

    // Overrides for Front door
    workerAppService.addOverride("site_config.ip_restriction.1", {
      virtual_network_subnet_id: null,
      ip_address: null
    });

    // Overrides for SCM restrictions
    for (let i = 0; i < scmIpRestrictionsList.length; i++) {
      workerAppService.addOverride("site_config.scm_ip_restriction." + i, {
        virtual_network_subnet_id: null,
        service_tag: null
      });
    }

    // Action Group
    const monitorActionGroup = new MonitorActionGroup(this, "MonitorActionGroup", {
      name: `501-cdk-actiongroup-${process.env.ENVNAME}-${process.env.STAGE}`,
      shortName: "501Alert",
      resourceGroupName: rg.name,
      emailReceiver: [
        {
          name: "TestiEmail",
          emailAddress: alertedUser,
          useCommonAlertSchema: true
        }
      ],
      azureAppPushReceiver: [{
        name: "TestiPush",
        emailAddress: alertedUser
      }],
      enabled: true
    });

    // Metric alert in app service
    new MonitorMetricAlert(this, "MonitorAppErrorAlert", {
      name: `501-cdk-BackendErrorsAlert-${process.env.ENVNAME}-${process.env.STAGE}`,
      description: "When HTTP errors happen",
      resourceGroupName: rg.name,
      severity: 2, //warning
      frequency: "PT5M",
      windowSize: "PT5M",
      scopes: [
        apiAppService.id
      ],
      criteria: [{
        aggregation: "Total",
        metricName: "Http5xx",
        metricNamespace: "Microsoft.Web/sites",
        operator: "GreaterThan",
        threshold: 0,
      }],
      action: [{
        actionGroupId: monitorActionGroup.id
      }]
    });

    // Metric alert in application insight
    new MonitorMetricAlert(this, "MonitorAiErrorAlert", {
      name: `501-cdk-AiBackendErrorsAlert-${process.env.ENVNAME}-${process.env.STAGE}`,
      description: "When the count of exceptions is greater than 0",
      resourceGroupName: rg.name,
      severity: 2, //warning
      frequency: "PT5M",
      windowSize: "PT5M",
      scopes: [
        ai.id
      ],
      criteria: [{
        aggregation: "Count",
        metricName: "exceptions/count",
        metricNamespace: "microsoft.insights/components",
        operator: "GreaterThan",
        threshold: 0,
      }],
      action: [{
        actionGroupId: monitorActionGroup.id
      }]
    });

    // WebTests
    new ApplicationInsightsWebTest(this, "ApplicationInsightsBackendAvailability", {
      name: `501-cdk-backendavailabilitytest-${process.env.ENVNAME}-${process.env.STAGE}`,
      resourceGroupName: rg.name,
      location: rg.location,
      applicationInsightsId: ai.id,
      kind: "ping",
      geoLocations: [
        "emea-gb-db3-azr", // North europe
        "us-tx-sn1-azr", // South Central US
        "apac-hk-hkn-azr", // East Asia
        "emea-ch-zrh-edge", // France South
        "emea-ru-msa-edge", // UK South
      ],
      frequency: 300,
      timeout: 60,
      enabled: true,
      configuration: `
        <WebTest 
          Name="501-cdk-backendavailabilitytest-${process.env.ENVNAME}-${process.env.STAGE}" 
          Id="ABD48585-0831-40CB-9069-682EA6BB3583" 
          Enabled="True" 
          CssProjectStructure="" 
          CssIteration="" 
          Timeout="0" 
          WorkItemIds="" 
          xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010" 
          Description="" 
          CredentialUserName="" 
          CredentialPassword="" 
          PreAuthenticate="True" 
          Proxy="default" 
          StopOnError="False" 
          RecordedResultFile="" 
          ResultsLocale="">
          
          <Items>
            <Request 
              Method="GET" 
              Guid="a5f10126-e4cd-570d-961c-cea43999a200" 
              Version="1.1" 
              Url="https://${apiAppService.defaultHostname}" 
              ThinkTime="0" 
              Timeout="300" 
              ParseDependentRequests="True" 
              FollowRedirects="True" 
              RecordResult="True" 
              Cache="False" 
              ResponseTimeGoal="0" 
              Encoding="utf-8" 
              ExpectedHttpStatusCode="200" 
              ExpectedResponseUrl="" 
              ReportingName="" 
              IgnoreHttpStatusCode="False" 
              />
          </Items>
        </WebTest>`,
      lifecycle: {
        ignoreChanges: [
          "tags"
        ]
      }
      // tags: {
      //   `hidden-link${ai.id}`: "resource"
      // }
    });

    new KeyVaultAccessPolicyA(this, "ApiAppPolicy", {
      keyVaultId: keyVault.id,
      tenantId: currentUser.tenantId,
      objectId: apiAppService.identity.getStringAttribute("principal_id"),

      secretPermissions: ["Get"]
    });

    new AppServiceVirtualNetworkSwiftConnection(this, "ApiAppServiceVirtualNetworkSwiftConnection", {
      appServiceId: apiAppService.id,
      subnetId: appSubnet.id
    });

    new AppServiceVirtualNetworkSwiftConnection(this, "WorkerAppServiceVirtualNetworkSwiftConnection", {
      appServiceId: workerAppService.id,
      subnetId: appSubnet.id
    });

    new PostgresqlVirtualNetworkRule(this, "PostgresqlVirtualNetworkRule", {
      name: `cdk-psql-vnetrule-${process.env.ENVNAME}-${process.env.STAGE}`,
      resourceGroupName: rg.name,
      serverName: psqlServer.name,
      subnetId: appSubnet.id
    });

    // Servicebus
    const servicebus = new ServicebusNamespace(this, "ServicebusNamespace", {
      name: `cdk-servicebusnamespace-${process.env.ENVNAME}-${process.env.STAGE}`,
      location: rg.location,
      resourceGroupName: rg.name,
      sku: "Premium",
      capacity: 1,
      zoneRedundant: true,
      identity: {
        type: "SystemAssigned"
      }

    });

    new ServicebusNamespaceNetworkRuleSet(this, "ServicebusNamespaceNetworkRules", {
      namespaceId: servicebus.id,

      defaultAction: "Deny",
      publicNetworkAccessEnabled: true,

      networkRules: [
        {
          subnetId: plSubnet.id,
          ignoreMissingVnetServiceEndpoint: true
        }
      ],

      ipRules: allowedIpAddresses
    });

    new ServicebusQueue(this, "ServicebusQueue", {
      name: `501-cdk-servicebusqueue-${process.env.ENVNAME}-${process.env.STAGE}`,
      namespaceId: servicebus.id,
    });

    // PostgreSQL Zone
    const privateDnsPsql = addPrivateDnsZoneWithLink(this, {
      zoneId: "PrivateDNSZonePsql",
      zoneName: "privatelink.postgres.database.azure.com",
      rgName: rg.name,
      linkId: "PrivateDnsZoneVnetLinkPsql",
      linkName: `501-cdk-psql-dnslink-${process.env.ENVNAME}-${process.env.STAGE}`,
      linkRegistration: false,
      vnetId: vnet.id
    });

    // Key Vault Zone
    const privateDnsKeyVault = addPrivateDnsZoneWithLink(this, {
      zoneId: "PrivateDNSZoneKv",
      zoneName: "privatelink.vaultcore.azure.net",
      rgName: rg.name,
      linkId: "PrivateDnsZoneVnetLinkKeyVault",
      linkName: `501-cdk-kv-dnslink-${process.env.ENVNAME}-${process.env.STAGE}`,
      linkRegistration: false,
      vnetId: vnet.id
    });

    const privateDnsServicebus = addPrivateDnsZoneWithLink(this, {
      zoneId: "PrivateDNSZoneServicebus",
      zoneName: "servicebus.windows.net",
      rgName: rg.name,
      linkId: "PrivateDnsZoneVnetLinkServicebus",
      linkName: `501-cdk-servicebus-dnslink-${process.env.ENVNAME}-${process.env.STAGE}`,
      linkRegistration: false,
      vnetId: vnet.id
    })

    // AMPLS Zone: Monitor
    const amplsMonitorDnsZone = addPrivateDnsZoneWithLink(this, {
      zoneId: "PrivateDNSZoneMonitor",
      zoneName: "privatelink.monitor.azure.com",
      rgName: rg.name,
      linkId: "PrivateDnsZoneVnetLinkMonitor",
      linkName: `501-cdk-monitor-dnslink-${process.env.ENVNAME}-${process.env.STAGE}`,
      linkRegistration: false,
      vnetId: vnet.id
    });

    // AMPLS Zone: OMS
    const amplsOmsDnsZone = addPrivateDnsZoneWithLink(this, {
      zoneId: "PrivateDNSZoneOMS",
      zoneName: "privatelink.oms.opinsights.azure.com",
      rgName: rg.name,
      linkId: "PrivateDnsZoneVnetLinkOms",
      linkName: `501-cdk-oms-dnslink-${process.env.ENVNAME}-${process.env.STAGE}`,
      linkRegistration: false,
      vnetId: vnet.id
    });

    // AMPLS Zone: ODS
    const amplsOdsDnsZone = addPrivateDnsZoneWithLink(this, {
      zoneId: "PrivateDNSZoneOds",
      zoneName: "privatelink.ods.opinsights.azure.com",
      rgName: rg.name,
      linkId: "PrivateDnsZoneVnetLinkOds",
      linkName: `501-cdk-Ods-dnslink-${process.env.ENVNAME}-${process.env.STAGE}`,
      linkRegistration: false,
      vnetId: vnet.id
    });

    // AMPLS Zone: AgentSvc
    const amplsAgentSvcDnsZone = addPrivateDnsZoneWithLink(this, {
      zoneId: "PrivateDNSZoneAgentSvc",
      zoneName: "privatelink.agentsvc.azure-automation.net",
      rgName: rg.name,
      linkId: "PrivateDnsZoneVnetLinkAgentSvc",
      linkName: `501-cdk-agentsvc-dnslink-${process.env.ENVNAME}-${process.env.STAGE}`,
      linkRegistration: false,
      vnetId: vnet.id
    });

    // AMPLS Zone: Blob
    const amplsBlobDnsZone = addPrivateDnsZoneWithLink(this, {
      zoneId: "PrivateDNSZoneBlob",
      zoneName: "privatelink.blob.core.windows.net",
      rgName: rg.name,
      linkId: "PrivateDnsZoneVnetLinkBlob",
      linkName: `501-cdk-blob-dnslink-${process.env.ENVNAME}-${process.env.STAGE}`,
      linkRegistration: false,
      vnetId: vnet.id
    });

    // Private endpoint for PostgreSQL
    new PrivateEndpoint(this, "PsqlPrivateEndpoint", {
      name: `501-cdk-psql-endpoint-${process.env.ENVNAME}-${process.env.STAGE}`,
      location: rg.location,
      resourceGroupName: rg.name,
      subnetId: plSubnet.id,
      privateServiceConnection: {
        name: "cdk-psql-connection",
        privateConnectionResourceId: psqlServer.id,
        isManualConnection: false,
        subresourceNames: ["postgresqlServer"],
      },
      privateDnsZoneGroup: {
        name: "default",
        privateDnsZoneIds: [privateDnsPsql.id]
      }
    });

    // Private endpoint for Key Vault
    new PrivateEndpoint(this, "KeyVaultPrivateEndpoint", {
      name: `501-cdk-kv-endpoint-${process.env.ENVNAME}-${process.env.STAGE}`,
      location: rg.location,
      resourceGroupName: rg.name,
      subnetId: plSubnet.id,
      privateServiceConnection: {
        name: "cdk-kv-connection",
        privateConnectionResourceId: keyVault.id,
        isManualConnection: false,
        subresourceNames: ["vault"],
      },
      privateDnsZoneGroup: {
        name: "default",
        privateDnsZoneIds: [privateDnsKeyVault.id]
      }
    });

    // Private endpoint for Servicebus
    new PrivateEndpoint(this, "ServicebusPrivateEndpoint", {
      name: `501-cdk-sb-endpoint-${process.env.ENVNAME}-${process.env.STAGE}`,
      location: rg.location,
      resourceGroupName: rg.name,
      subnetId: plSubnet.id,
      privateServiceConnection: {
        name: "cdk-sb-connection",
        privateConnectionResourceId: servicebus.id,
        isManualConnection: false,
        subresourceNames: ["namespace"],
      },
      privateDnsZoneGroup: {
        name: "default",
        privateDnsZoneIds: [privateDnsServicebus.id]
      }
    });

    // Private endpoint for AMPLS
    new PrivateEndpoint(this, "AmplsPrivateEndpoint", {
      name: `501-cdk-ampls-endpoint-${process.env.ENVNAME}-${process.env.STAGE}`,
      location: rg.location,
      resourceGroupName: rg.name,
      subnetId: plSubnet.id,
      privateServiceConnection: {
        name: "cdk-ampls-connection",
        privateConnectionResourceId: ampls.id,
        isManualConnection: false,
        subresourceNames: ["azuremonitor"],
      },
      privateDnsZoneGroup: {
        name: "default",
        privateDnsZoneIds: [
          amplsMonitorDnsZone.id,
          amplsOmsDnsZone.id,
          amplsOdsDnsZone.id,
          amplsAgentSvcDnsZone.id,
          amplsBlobDnsZone.id
        ]
      }
    });

    new TerraformOutput(this, "FrontDoor", {
      value: `${frontDoor.headerFrontdoorId}`,
    });

  }
}

const addPrivateDnsZoneWithLink = (construct: Construct, dnsCconfig: DnsConfig) => {
  const dnsZone = new PrivateDnsZone(construct, dnsCconfig.zoneId, {
    name: dnsCconfig.zoneName,
    resourceGroupName: dnsCconfig.rgName
  });

  new PrivateDnsZoneVirtualNetworkLink(construct, dnsCconfig.linkId, {
    name: dnsCconfig.linkName,
    resourceGroupName: dnsCconfig.rgName,
    privateDnsZoneName: dnsZone.name,
    virtualNetworkId: dnsCconfig.vnetId,
    registrationEnabled: dnsCconfig.linkRegistration
  });

  return dnsZone;
}

const app = new App();

// const config: { [key: string]: string } = {
//   testi: "testi"
// };

new MyStack(app, "501-cdk-template");
app.synth();
