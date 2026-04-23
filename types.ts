export interface InputParameter {
  id: string;
  name: string;
  type: string;
  required: boolean;
}

export type TableOperation = 'SELECT' | 'UPDATE' | 'INSERT' | 'DELETE';

export interface Table {
  id: string;
  name: string;
  operation: TableOperation;
  fields: string;
  whereClause: string;
}

export interface AppUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  username: string;
}

export interface AuthState {
  user: AppUser | null;
  token: string | null;
}

export interface ReportListItem {
  id: number;
  program_name: string;
  description: string;
  model: string;
  generation_profile: string;
  created_at: string;
}

export interface ReportDetail extends ReportListItem {
  input_parameters: InputParameter[];
  tables: Table[];
  output_description: string;
  generated_code: string;
}

export interface ReportSpec {
  programName: string;
  programDescription: string;
  inputParameters: InputParameter[];
  tables: Table[];
  outputDescription: string;
  model: string;
  generationProfile: string;
}
