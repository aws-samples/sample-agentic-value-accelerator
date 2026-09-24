import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { PolicyParams, AutonomyProfile } from '../data/autonomyProfiles';
import { PROFILES, DEFAULT_PROFILE } from '../data/autonomyProfiles';
import * as service from '../services/policyConfigService';
import type { ChangeLogEntry } from '../services/policyConfigService';

interface PolicyConfigContextType {
  activeProfile: AutonomyProfile;
  params: PolicyParams;
  isCustom: boolean;
  changeLog: ChangeLogEntry[];
  applying: boolean;
  applyProfile: (id: string) => Promise<void>;
  updateParam: (key: keyof PolicyParams, value: number | boolean) => Promise<void>;
  triggerKillSwitch: () => Promise<void>;
}

const PolicyConfigContext = createContext<PolicyConfigContextType>({
  activeProfile: DEFAULT_PROFILE,
  params: { ...DEFAULT_PROFILE.params },
  isCustom: false,
  changeLog: [],
  applying: false,
  applyProfile: async () => {},
  updateParam: async () => {},
  triggerKillSwitch: async () => {},
});

export function PolicyConfigProvider({ children }: { children: ReactNode }) {
  const stored = service.getActiveConfig();
  const [profileId, setProfileId] = useState(stored.profileId);
  const [params, setParams] = useState<PolicyParams>(stored.params);
  const [changeLog, setChangeLog] = useState<ChangeLogEntry[]>(service.getChangeLog());
  const [applying, setApplying] = useState(false);

  const activeProfile = PROFILES.find(p => p.id === profileId) || DEFAULT_PROFILE;
  const isCustom = profileId === 'custom';

  // Load the authoritative config from the server (DDB) on mount. The service
  // holds only an in-memory cache (no localStorage — invariant #4), so this is
  // how the real persisted state reaches the UI after a reload.
  useEffect(() => {
    let cancelled = false;
    service.refresh().then(() => {
      if (cancelled) return;
      const c = service.getActiveConfig();
      setProfileId(c.profileId);
      setParams(c.params);
      setChangeLog(service.getChangeLog());
    });
    return () => { cancelled = true; };
  }, []);

  const applyProfile = useCallback(async (id: string) => {
    setApplying(true);
    const result = await service.applyProfile(id);
    if (result.success) {
      const p = PROFILES.find(pr => pr.id === id);
      if (p) { setProfileId(id); setParams({ ...p.params }); }
      setChangeLog(service.getChangeLog());
    }
    setApplying(false);
  }, []);

  const updateParam = useCallback(async (key: keyof PolicyParams, value: number | boolean) => {
    setParams(prev => ({ ...prev, [key]: value }));
    setProfileId('custom');
    await service.updateParam(key, value);
    setChangeLog(service.getChangeLog());
  }, []);

  const triggerKillSwitch = useCallback(async () => {
    setApplying(true);
    await service.applyProfile('conservative');
    setProfileId('conservative');
    setParams({ ...PROFILES[0].params, maxAutonomyScope: 0 });
    setChangeLog(service.getChangeLog());
    setApplying(false);
  }, []);

  return (
    <PolicyConfigContext.Provider value={{ activeProfile, params, isCustom, changeLog, applying, applyProfile, updateParam, triggerKillSwitch }}>
      {children}
    </PolicyConfigContext.Provider>
  );
}

export function usePolicyConfig() {
  return useContext(PolicyConfigContext);
}
