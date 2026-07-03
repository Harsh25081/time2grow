export type Persona = 'creator' | 'founder' | 'coach' | 'local_business' | 'agency';

export type Profile = {
  id: string;
  full_name: string | null;
  persona: Persona;
  demo_mode: boolean;
  created_at: string;
  updated_at: string;
};

export type Organization = {
  id: string;
  name: string;
  slug: string | null;
  org_type: 'solo' | 'agency' | 'company';
  plan_key: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type OrganizationMembership = {
  id: string;
  org_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer' | 'billing_admin';
  status: 'active' | 'invited' | 'suspended';
  joined_at: string | null;
  created_at: string;
};
