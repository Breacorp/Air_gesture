/**
 * Profile Manager
 * Registry and state manager for Air Gesture interaction profiles.
 */

export class ProfileManager {
  constructor() {
    this.profiles = new Map();
    this.activeProfileId = 'universal';
    this.onProfileChange = null;
    this.context = null;
  }

  setContext(context) {
    this.context = context;
  }

  register(profile) {
    this.profiles.set(profile.id, profile);
  }

  setProfile(id) {
    if (this.profiles.has(id)) {
      const oldProfile = this.getActive();
      if (oldProfile && oldProfile.onDeactivate) {
        oldProfile.onDeactivate(this.context);
      }

      this.activeProfileId = id;
      const newProfile = this.getActive();
      if (newProfile && newProfile.onActivate) {
        newProfile.onActivate(this.context);
      }

      if (this.onProfileChange) {
        this.onProfileChange(newProfile);
      }
      console.log(`[ProfileManager] Activated profile: ${newProfile.name}`);
      return newProfile;
    }
    return null;
  }

  getActive() {
    return this.profiles.get(this.activeProfileId);
  }

  getAll() {
    return Array.from(this.profiles.values());
  }
}
