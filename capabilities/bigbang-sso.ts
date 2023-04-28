import {
  Capability,
  PeprRequest,
  RegisterKind,
  a,
  fetch,
  fetchStatus,
} from "pepr";

import { KeycloakAPI } from "./keycloak-api";
import { K8sAPI } from "./kubernetes-api";

import { parse, stringify } from 'yaml'

/**
 *  The BigBangSso Capability is an example capability to demonstrate some general concepts of Pepr.
 *  To test this capability you can run `pepr dev` or `npm start` and then run the following command:
 *  `kubectl apply -f capabilities/hello-pepr.samples.yaml`
 */
export const BigBangSso = new Capability({
  name: "bigbang-sso",
  description: "Configure Big Bang SSO",
  namespaces: ["neuvector"],
});

// Use the 'When' function to create a new Capability Action
const { When } = BigBangSso;

interface NeuvectorOIDCInit {
  always_reload: boolean;
  client_id: string;
  client_secret: string;
  default_role: string;
  enable: boolean;
  group_claim: string;
  group_mapped_roles: Array<{ group_role: string, group: string}>;
  issuer: string;
}

interface User {
  username: string;
  password?: string;
  email: string;
  first: string;
  last: string;
}

const keycloakBaseUrl = "https://keycloak.bigbang.dev/auth";
const realmName = "pepr";
const userName = "rob";

const user: User = {
  username: "rob",
  email: "rob@foo.com",
  first: "Rob",
  last: "Ferguson"
}

When(a.Secret)
  .IsCreated()
  .WithName("neuvector-init")
  .Then(async change => {

    const k8sApi = new K8sAPI();

    // const password = await k8sApi.getSecretValue(
    //   "keycloak",
    //   "keycloak-env",
    //   "KEYCLOAK_ADMIN_PASSWORD:"
    // );

    // For some reason KK password in BB is password and not KEYCLOAK_ADMIN
    const kcAPI = new KeycloakAPI(keycloakBaseUrl, 'password');

    await kcAPI.createOrGetKeycloakRealm(realmName)
    
    const secret = await kcAPI.createOrGetClientSecret(
      realmName,
      "neuvector",
      "neuvector",
      "https://neuvector.bigbang.dev/openId_auth",
      "https://neuvector.bigbang.dev",
      "https://neuvector.bigbang.dev"
    );

    let oidcConfig: NeuvectorOIDCInit = {
      always_reload: true,
      client_id: "neuvector",
      client_secret: secret,
      default_role: "admin",
      enable: true,
      group_claim: "role",
      group_mapped_roles: [ { group_role: "role",  group: "role"} ],
      issuer: "https://keycloak.bigbang.dev/auth/realms/pepr"
    }

    change.Raw.data["oidcinitcfg.yaml"] = Buffer.from(stringify(oidcConfig)).toString("base64")

    const generatedPassword = await kcAPI.createUser(realmName, user.username, user.email, user.first, user.last)

    await k8sApi.createKubernetesSecret(
      change.Raw.metadata.namespace,
      'neuvector-sso-user',
      user.username,
      generatedPassword
    );

  });
