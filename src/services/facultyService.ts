import { supabase } from '../lib/supabase';
import type { Profile } from '../types/database';

export type CreateFacultyInput = {
  name: string;
  role: string;
};

export type UpdateFacultyInput = CreateFacultyInput & {
  id: string;
};

export type FaceEmbeddingResponse = {
  embedding: number[];
};

export async function createFaculty(input: CreateFacultyInput): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      name: input.name.trim(),
      role: input.role.trim(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function enrollFacultyFace(profileId: string, imageBase64: string): Promise<Profile> {
  const { data, error } = await supabase.functions.invoke<FaceEmbeddingResponse>(
    'generate-face-embedding',
    {
      body: { imageBase64 },
    },
  );

  if (error) throw error;
  if (!data?.embedding || data.embedding.length !== 128) {
    throw new Error('Face enrollment failed: expected a 128-d embedding.');
  }

  const { data: profile, error: updateError } = await supabase
    .from('profiles')
    .update({ face_embedding: data.embedding })
    .eq('id', profileId)
    .select()
    .single();

  if (updateError) throw updateError;
  return profile;
}

export async function listFaculty(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, role, face_embedding, created_at')
    .order('name', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function updateFaculty(input: UpdateFacultyInput): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      name: input.name.trim(),
      role: input.role.trim(),
    })
    .eq('id', input.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteFaculty(profileId: string): Promise<void> {
  const { error } = await supabase.from('profiles').delete().eq('id', profileId);

  if (error) throw error;
}
