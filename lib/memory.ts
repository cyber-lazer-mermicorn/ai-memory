import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Memory Types
export type MemoryType = 'episodic' | 'semantic' | 'procedural';

export interface Memory {
  id?: string;
  agentId: string;
  type: MemoryType;
  content: string;
  embedding?: number[];
  metadata?: Record<string, any>;
  importance: number;
  createdAt?: Date;
  lastAccessed?: Date;
}

// Memory Manager
export class MemoryManager {
  private agentId: string;

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  // Store a memory
  async store(content: string, type: MemoryType, metadata?: Record<string, any>) {
    try {
      const embedding = await this.generateEmbedding(content);
      const importance = this.calculateImportance(content, type);

      const { data, error } = await supabase
        .from('memories')
        .insert({
          agent_id: this.agentId,
          type,
          content,
          embedding,
          metadata,
          importance,
          created_at: new Date().toISOString(),
          last_accessed: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error: any) {
      throw new Error(`Memory store error: ${error?.message || 'Unknown error'}`);
    }
  }

  // Recall relevant memories
  async recall(query: string, limit = 5) {
    try {
      const embedding = await this.generateEmbedding(query);

      const { data, error } = await supabase.rpc('match_memories', {
        query_embedding: embedding,
        agent_id: this.agentId,
        match_threshold: 0.7,
        match_count: limit,
      });

      if (error) throw error;

      // Update last accessed
      for (const memory of data || []) {
        await supabase
          .from('memories')
          .update({ last_accessed: new Date().toISOString() })
          .eq('id', memory.id);
      }

      return data || [];
    } catch (error: any) {
      throw new Error(`Memory recall error: ${error?.message || 'Unknown error'}`);
    }
  }

  // Forget old/unused memories
  async forget(olderThanDays = 30) {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - olderThanDays);

      const { error } = await supabase
        .from('memories')
        .delete()
        .eq('agent_id', this.agentId)
        .lt('last_accessed', cutoff.toISOString())
        .lt('importance', 0.5);

      if (error) throw error;
    } catch (error: any) {
      throw new Error(`Memory forget error: ${error?.message || 'Unknown error'}`);
    }
  }

  // Get memory stats
  async getStats() {
    try {
      const { data, error } = await supabase
        .from('memories')
        .select('type, importance')
        .eq('agent_id', this.agentId);

      if (error) throw error;

      const stats = {
        total: data?.length || 0,
        byType: {
          episodic: data?.filter(m => m.type === 'episodic').length || 0,
          semantic: data?.filter(m => m.type === 'semantic').length || 0,
          procedural: data?.filter(m => m.type === 'procedural').length || 0,
        },
        avgImportance: data?.reduce((sum, m) => sum + m.importance, 0) / (data?.length || 1) || 0,
      };

      return stats;
    } catch (error: any) {
      throw new Error(`Memory stats error: ${error?.message || 'Unknown error'}`);
    }
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    const res = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return res.data[0].embedding;
  }

  private calculateImportance(content: string, type: MemoryType): number {
    let base = 0.5;
    if (type === 'semantic') base = 0.7;
    if (type === 'procedural') base = 0.8;
    if (content.length > 100) base += 0.1;
    if (content.includes('important') || content.includes('critical')) base += 0.2;
    return Math.min(base, 1.0);
  }
}