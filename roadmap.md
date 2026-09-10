# Roadmap

- [x] Fix published Lovable site returning 1003 / not publicly accessible
  - published Worker must not fetch localhost (Cloudflare 1003)
  - target must be a non-Cloudflare tunnel (localtunnel, fixed subdomain, supervised)
- [ ] Persist workspace code files across visits (user request 17:06 UTC)
  - decide storage: /mnt/documents-backed project copy vs Cloud storage
- [x] Public access fixed and verified end to end (sign-up -> console on published URL)
- [ ] Persist project + installed dependencies so workspace reset does not wipe them (10:28 UTC Sep 10)
  - source master: /mnt/documents/hackerai (+ /dev-server/scripts/hackerai in repo)
  - dependency cache: /mnt/documents/hackerai-node-modules.tar.zst restored to /root/hackerai on start
  - /mnt/documents is noexec -> native .node addons cannot run from there; cache+restore instead of symlink
