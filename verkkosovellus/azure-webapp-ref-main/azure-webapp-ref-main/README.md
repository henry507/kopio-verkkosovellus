# Table of Contents
- [Table of Contents](#table-of-contents)
- [Reference architecture for a website on Azure](#reference-architecture-for-a-website-on-azure)
  - [Security](#security)
  - [Operational excellence](#operational-excellence)
  - [Reliability](#reliability)
  - [Performance Efficiency](#performance-efficiency)
  - [Cost Optimization](#cost-optimization)
  - [Background of architectual decisions and further development](#background-of-architectual-decisions-and-further-development)
- [Details & Usage](#details--usage)
  - [Pipelines](#pipelines)
  - [IaC](#iac)
  - [Frontend](#frontend)
  - [Backend](#backend)
- [Other documentation](#other-documentation)

# Reference architecture for a website on Azure 
This architecture creates a modern website. Frontend is a Single Page Application and it’s served from Azure Storage Account Blob Storage static website. Microservices backend, which provides API’s for the frontend, is served from a Azure App Service Web App.

The backend application communicates safely via a Virtual Network (Vnet) to other services like Service Bus and PostGreSQL database. Service Bus queues are used to de-couple long lasting processing from the API-layer and a worker Web App consumes messages from the queues.

All secrets are kept in Azure Key Vault. Web App can retrieve them via Vnet and identity-based access control is utilized.

The application uses Application Insights to collect logs and metrics and to create alerts in case of errors or bottlenecks.

Azure FrontDoor is placed in front of all end-user endpoints. FrontDoor can cache the requests to static assets and therefore works as a CDN. A Web Application Firewall (WAF) can be applied to FrontDoor, which improves security.

![Architecture](./docs/images/azure-webapp-ref.drawio.svg)

## Security
- All network traffic is protected with TLS (1.2)
- All data is stored encrypted with customer managed key saved in Key Vault
- Endpoints serving end-users are behind FrontDoor
  - As FrontDoor is a global Azure service, it’s hard to Ddos it
  - A WAF can and should be setup with FrontDoor. WAF can be used to mitigate many security issues. E.g. with the Log4J-vurnerability, WAF could’ve been set to filter jndi-strings
- All secrets are saved to Key Vault
- All communication between backend services (Web app, database, Key Vault and Application Insights) is done via Vnet
- Access to PostGreSQL should be limited to Vnet and maybe also to developers/admins from the internet. In this case, the developers/admins IP’s should be added to PostGreSQL’s firewall. The other way to let developers/admins use PostGreSQL is to set up a VPN Gateway to the Vnet

## Operational excellence
- All used services are Azure PaaS
  - Azure takes care of running and patching the services
- Logs and metrics are collected to Application Insights
  - Based on logs and metrics, alerts and even self-healing automation can be setup
- Infrastructure is setup with a Terraform IaC –template
- CI/CD is done with Github Actions that is authenticated with OIDC

## Reliability
- All used services are Azure PaaS
  - Azure takes care of running and patching the services

## Performance Efficiency
- Azure Web App autoscaling can be applied to automatically up&downscale
- Azure PostGreSQL can scale automatically, but some automation needs to be built to make it happen
- Using FrontDoor, end users will see better response times as:
  - Static assets can be cached to FrontDoor edge location and therefore they are more close to users
  - Also dynamic requests will benefit from FrontDoor traffic acceleration

## Cost Optimization
- Be sure to select the optimal SKU-sizes for Web App and PostGreSQL

## Background of architectual decisions and further development
- Why we didn’t use
  - Azure Static Web Apps
    - As of writing, it does not support Vnet integration, so we didn’t get the wanted security. If it’s ok for your application to have open database ports to the internet, feel free to use Static Web Apps
  - Azure Functions
    - We probably will make a reference architecture with Azure Functions in the future. 
- Potential new features to this reference architecture
  - Azure AD –authentication
  - CosmosDB as database

# Details & Usage
This chapter contains detailed information about each of the components.

## Pipelines
TBD

## IaC
TBD

## Frontend
TBD

## Backend
TBD

# Other documentation
Material in PPTX can be found [here](https://groupecgi.sharepoint.com/:p:/r/teams/COL00012971/Shared%20Documents/Developer%20portal/BU_ICE_Reference_architecture_Azure-v1.pptx?d=w1771e4f3f3784532a3dff9138e8144e2&csf=1&web=1&e=GbOltT).