// seed-pages.mjs — creates Team Penta space pages in Confluence Cloud
// Run: node k8s/seed-pages.mjs

const BASE = 'https://kachlonistinvesting.atlassian.net/wiki';
const TOKEN = 'a2FjaGxvbmlzdGludmVzdGluZ0BnbWFpbC5jb206QVRBVFQzeEZmR0Ywc0w0cTVyUmF4OFF0dnVlVmdKbDlXbW5XU1BtMlVHb3ZaVVFVZmJ3YmJBY2FrVlFISERQRURobHVNVkVnTUJxT3Fta3NJTzkzTk45akdaRkwwQ05QYXdfNTJCd1ZFYUV2cEZQczU4ZWNnb2FEYldtc2VqMlJKZXRDVkx6QnBaaTFzVEJjUm4ydGkteDJnQTVPeERLNnk3dTR1bF9WdnJuUlltX3hha2N1dzJBPUQ5OEJGRkZC';
const H = { 'Authorization': 'Basic ' + TOKEN, 'Content-Type': 'application/json', 'Accept': 'application/json' };

const pages = [
  {
    title: 'Kafka Guide',
    body: `<h1>Apache Kafka — Team Penta Guide</h1>
<h2>Getting Started</h2>
<p>Apache Kafka is a distributed event streaming platform. Core concepts:</p>
<ul>
<li><strong>Topics</strong>: named streams of records, divided into partitions for parallelism.</li>
<li><strong>Producers</strong>: applications that publish records to topics.</li>
<li><strong>Consumers</strong>: applications that subscribe to topics and process records.</li>
<li><strong>Consumer Groups</strong>: multiple consumers sharing partition assignment for horizontal scaling.</li>
<li><strong>Brokers</strong>: Kafka server nodes that store and serve data.</li>
</ul>
<h2>Common Configuration Pitfalls</h2>
<ul>
<li><strong>replication.factor too low</strong>: always set &gt;= 3 in production; min.insync.replicas should be replication.factor - 1.</li>
<li><strong>retention.ms too short</strong>: default 7 days; increase for audit or replay use cases.</li>
<li><strong>max.message.bytes mismatch</strong>: broker and producer/consumer values must align.</li>
<li><strong>auto.offset.reset=latest</strong>: new consumer groups miss historical data; prefer earliest for batch jobs.</li>
<li><strong>unclean.leader.election.enable=true</strong>: risks data loss; keep false in production.</li>
</ul>
<h2>Strimzi Operator for Kafka on Kubernetes</h2>
<p>Strimzi automates Kafka cluster lifecycle on k8s via CRDs.</p>
<h3>Installation</h3>
<pre>kubectl create namespace kafka
kubectl apply -f https://strimzi.io/install/latest?namespace=kafka -n kafka</pre>
<h3>Kafka Cluster CR</h3>
<pre>apiVersion: kafka.strimzi.io/v1beta2
kind: Kafka
metadata:
  name: my-cluster
  namespace: kafka
spec:
  kafka:
    replicas: 3
    listeners:
      - name: plain
        port: 9092
        type: internal
        tls: false
    config:
      offsets.topic.replication.factor: 3
      min.insync.replicas: 2
    storage:
      type: jbod
      volumes:
        - id: 0
          type: persistent-claim
          size: 50Gi
  zookeeper:
    replicas: 3
    storage:
      type: persistent-claim
      size: 10Gi</pre>
<h3>KafkaTopic CR</h3>
<pre>apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: my-topic
  labels:
    strimzi.io/cluster: my-cluster
spec:
  partitions: 6
  replicas: 3
  config:
    retention.ms: 604800000</pre>
<h3>KafkaUser CR</h3>
<pre>apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaUser
metadata:
  name: my-user
  labels:
    strimzi.io/cluster: my-cluster
spec:
  authentication:
    type: scram-sha-512
  authorization:
    type: simple
    acls:
      - resource:
          type: topic
          name: my-topic
        operations: [Read, Write, Describe]</pre>
<h3>Upgrading Strimzi</h3>
<p>Always upgrade the operator before upgrading the Kafka version. Never skip major versions. Check the Strimzi upgrade guide for the correct version ladder.</p>
<h2>Common Issues</h2>
<ul>
<li><strong>Consumer lag</strong>: check with kafka-consumer-groups.sh --describe. Root causes: slow processing, GC pauses. Scale consumer group or optimise processing.</li>
<li><strong>Rebalancing storms</strong>: caused by session.timeout.ms too low or GC pauses. Increase heartbeat.interval.ms; use static group membership (group.instance.id).</li>
<li><strong>Out-of-sync replicas</strong>: usually disk I/O or network saturation. Check broker JMX metric ReplicaManager/UnderReplicatedPartitions. Throttle replication with kafka-reassign-partitions.sh.</li>
<li><strong>Leader not available</strong>: transient during rolling restart; retry with exponential backoff.</li>
</ul>`
  },
  {
    title: 'Redis Guide',
    body: `<h1>Redis — Team Penta Guide</h1>
<h2>Redis Fundamentals</h2>
<p>Redis is an in-memory data structure store used as a cache, message broker, and database.</p>
<h3>Key Data Types</h3>
<ul>
<li><strong>String</strong>: simple key-value, binary-safe. Use for counters, session tokens.</li>
<li><strong>Hash</strong>: field-value map within a key. Efficient for objects.</li>
<li><strong>List</strong>: linked list. Use for queues (RPUSH/BLPOP).</li>
<li><strong>Set / Sorted Set</strong>: unique members; sorted sets add a score for ranking.</li>
<li><strong>Stream</strong>: append-only log, Kafka-like within Redis (XADD/XREAD).</li>
</ul>
<h3>Persistence Modes</h3>
<ul>
<li><strong>RDB</strong>: point-in-time snapshots. Fast restarts, some data loss risk.</li>
<li><strong>AOF</strong>: append-only file. More durable but larger.</li>
<li><strong>RDB+AOF</strong>: recommended for production.</li>
</ul>
<h2>Redis Sentinel</h2>
<p>Sentinel provides HA for Redis without clustering. Monitors master/replica nodes and performs automatic failover.</p>
<h3>Sentinel Config (3 sentinels minimum)</h3>
<pre>sentinel monitor mymaster 127.0.0.1 6379 2
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 60000
sentinel parallel-syncs mymaster 1</pre>
<h3>Failover Process</h3>
<ol>
<li>Sentinel detects master unreachable (SDOWN after down-after-milliseconds).</li>
<li>Quorum of sentinels agree on ODOWN (objective down).</li>
<li>Sentinel leader elected via Raft; promotes best replica to master.</li>
<li>Other replicas reconfigured to replicate from new master.</li>
<li>Old master reconfigured as replica on recovery.</li>
</ol>
<h3>Redis Sentinel vs Redis Cluster</h3>
<table><tbody>
<tr><th>Feature</th><th>Sentinel</th><th>Cluster</th></tr>
<tr><td>Sharding</td><td>No</td><td>Yes (16384 slots)</td></tr>
<tr><td>Horizontal write scale</td><td>No</td><td>Yes</td></tr>
<tr><td>HA failover</td><td>Yes</td><td>Yes</td></tr>
<tr><td>Client complexity</td><td>Low</td><td>Higher (cluster-aware client)</td></tr>
</tbody></table>
<h2>Common Issues</h2>
<ul>
<li><strong>Memory eviction (OOM)</strong>: set maxmemory and choose an eviction policy (allkeys-lru for caches, noeviction for durable stores). Monitor used_memory_rss vs used_memory; large delta = fragmentation — run MEMORY PURGE.</li>
<li><strong>Connection pool exhaustion</strong>: Redis is single-threaded. Size pool to expected concurrency. Use INFO clients to monitor connected_clients.</li>
<li><strong>READONLY errors during failover</strong>: client connected to old master (now replica). Use Sentinel-aware client connection. Implement retry on READONLY.</li>
<li><strong>Slow commands blocking event loop</strong>: avoid KEYS * and SMEMBERS on large sets. Use SCAN. Check slowlog get 10 regularly.</li>
</ul>`
  },
  {
    title: 'Zookeeper Guide',
    body: `<h1>Apache ZooKeeper — Team Penta Guide</h1>
<h2>Role in Distributed Systems</h2>
<p>ZooKeeper is a distributed coordination service providing:</p>
<ul>
<li><strong>Configuration management</strong>: centralised, consistent config storage.</li>
<li><strong>Naming registry</strong>: service discovery via ephemeral znodes.</li>
<li><strong>Distributed synchronisation</strong>: locks, barriers, leader election primitives.</li>
<li><strong>Group membership</strong>: track live nodes via ephemeral nodes and watches.</li>
</ul>
<p>In Kafka (pre-KRaft), ZooKeeper stored broker metadata, topic configs, ACLs, and coordinated controller election.</p>
<h2>Quorum and Leader Election</h2>
<p>ZooKeeper uses ZAB (ZooKeeper Atomic Broadcast) protocol. A quorum of (n/2)+1 nodes must be available for writes. Always deploy an odd number (3, 5, 7). Leader handles all writes; followers serve reads.</p>
<h3>Useful CLI Commands</h3>
<pre># Connect to ZK shell
zkCli.sh -server localhost:2181

# List children of a znode
ls /brokers/ids

# Get znode data
get /controller

# 4-letter health commands
echo stat | nc localhost 2181
echo ruok | nc localhost 2181   # responds "imok" if healthy</pre>
<h2>Common Issues</h2>
<ul>
<li><strong>Session expiry</strong>: client did not heartbeat within session timeout (default 10s). Increase zookeeper.session.timeout.ms on Kafka brokers. Check for GC pauses. Ephemeral nodes deleted on expiry — triggers broker re-registration.</li>
<li><strong>Split-brain</strong>: network partition causes two groups each believing they have quorum. Prevented by strict majority. Symptoms: duplicate controller elections in Kafka logs. Restore network and let ZK reconcile.</li>
<li><strong>Disk I/O saturation</strong>: ZK fsyncs every transaction. Use a dedicated low-latency disk for the transaction log. Monitor fsyncTime metric; over 20ms indicates contention.</li>
<li><strong>Too many znodes</strong>: ZK is not designed for large data; keep znodes under 1MB. Monitor zk_watch_count and zk_znode_count via mntr.</li>
</ul>
<h2>ZooKeeper Deprecation: Kafka KRaft Mode</h2>
<p>Kafka 3.3+ supports KRaft mode which replaces ZooKeeper entirely:</p>
<ul>
<li>Metadata stored in an internal Kafka topic (@metadata).</li>
<li>Controller quorum managed by Kafka brokers with the controller role.</li>
<li>Eliminates ZK operational overhead: no separate ZK cluster, no session timeouts, faster controller failover.</li>
<li>Strimzi Operator supports KRaft from Kafka 3.6+.</li>
<li>ZooKeeper-based clusters should plan migration to KRaft before ZK support is removed.</li>
</ul>`
  },
  {
    title: 'Vault Guide',
    body: `<h1>HashiCorp Vault — Team Penta Guide</h1>
<h2>Core Concepts</h2>
<ul>
<li><strong>Secrets Engines</strong>: plugins that store, generate, or encrypt secrets. Common: KV, PKI, Database, AWS/GCP.</li>
<li><strong>Auth Methods</strong>: how clients authenticate. Common: Kubernetes (service account JWT), AppRole, LDAP, Token.</li>
<li><strong>Policies</strong>: HCL/JSON ACL rules defining what paths a token can access.</li>
<li><strong>Tokens</strong>: the core credential. Every operation uses a token with TTL and policies.</li>
<li><strong>Leases</strong>: dynamic secrets have leases. Renew before expiry or the secret is revoked.</li>
</ul>
<h3>Example Policy</h3>
<pre>path "secret/data/myapp/*" {
  capabilities = ["read", "list"]
}
path "auth/token/renew-self" {
  capabilities = ["update"]
}</pre>
<h2>Deploying Vault on Kubernetes</h2>
<h3>Install via Helm</h3>
<pre>helm repo add hashicorp https://helm.releases.hashicorp.com
helm repo update
helm install vault hashicorp/vault \
  --namespace vault --create-namespace \
  --set "server.ha.enabled=true" \
  --set "server.ha.replicas=3" \
  --set "injector.enabled=true"</pre>
<h3>Auto-Unseal with Transit</h3>
<p>Without auto-unseal, Vault requires manual unseal on every restart. Configure Transit auto-unseal or a cloud KMS:</p>
<pre>seal "transit" {
  address         = "https://vault-transit.vault.svc.cluster.local:8200"
  token           = "s.xxxxxxxxxxxxxxxx"
  key_name        = "autounseal"
  mount_path      = "transit/"
}</pre>
<h3>Kubernetes Auth Method</h3>
<pre>vault auth enable kubernetes
vault write auth/kubernetes/config \
  kubernetes_host="https://kubernetes.default.svc" \
  kubernetes_ca_cert=@/var/run/secrets/kubernetes.io/serviceaccount/ca.crt \
  token_reviewer_jwt=@/var/run/secrets/kubernetes.io/serviceaccount/token

vault write auth/kubernetes/role/myapp \
  bound_service_account_names=myapp-sa \
  bound_service_account_namespaces=default \
  policies=myapp-policy \
  ttl=1h</pre>
<h2>Vault Agent Injector</h2>
<p>Mutates pods via annotations to inject secrets as files into /vault/secrets/:</p>
<pre>annotations:
  vault.hashicorp.com/agent-inject: "true"
  vault.hashicorp.com/role: "myapp"
  vault.hashicorp.com/agent-inject-secret-config.env: "secret/data/myapp/config"
  vault.hashicorp.com/agent-inject-template-config.env: |
    {{- with secret "secret/data/myapp/config" -}}
    export DB_PASSWORD="{{ .Data.data.db_password }}"
    {{- end }}</pre>
<p>The init container populates secrets before the app starts; the sidecar renews leases continuously.</p>
<h2>Common Issues</h2>
<ul>
<li><strong>Sealed state after pod restart</strong>: without auto-unseal, Vault seals on restart. All API calls return 503. Fix: configure auto-unseal (Transit or cloud KMS) or run vault operator unseal with 3 key shares.</li>
<li><strong>Token renewal failures</strong>: short-TTL tokens expire if the app does not renew them. Use Vault Agent for automatic renewal. Always use renewable tokens with a sensible max_ttl.</li>
<li><strong>Audit log flooding</strong>: high-traffic services generate enormous audit logs. Audit log write failure causes Vault to reject all requests — ensure disk/socket is healthy. Route to a log aggregator with sampling.</li>
<li><strong>Dynamic secret lease expiry</strong>: database credentials revoked when lease expires if not renewed. Ensure Vault Agent or SDK handles renewal. Monitor lease count via vault list sys/leases/lookup/.</li>
<li><strong>HA leader election on network partition</strong>: Raft-based HA handles this gracefully. After recovery run vault operator raft list-peers and remove stale peers with vault operator raft remove-peer.</li>
</ul>`
  }
];

async function main() {
  for (const p of pages) {
    const r = await fetch(BASE + '/rest/api/content', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        type: 'page',
        title: p.title,
        space: { key: 'PENTA' },
        body: { storage: { value: p.body, representation: 'storage' } }
      })
    });
    const j = await r.json();
    if (r.ok) {
      console.log('Created:', p.title, '— ID:', j.id);
    } else {
      console.log('FAILED:', p.title, r.status, JSON.stringify(j).slice(0, 300));
    }
  }
}

main().catch(console.error);
