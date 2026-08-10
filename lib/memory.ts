import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

  async getStats() {
    try {
      const { data, error } = await supabase
        .from('memories')
        .select('type, importance')
        .eq('agent_id', this.agentId);

      if (error) throw error;

      return {
        total: data?.length || 0,
        byType: {
          episodic: data?.filter(m => m.type === 'episodic').length || 0,
          semantic: data?.filter(m => m.type === 'semantic').length || 0,
          procedural: data?.filter(m => m.type === 'procedural').length || 0,
        },
        avgImportance: data?.reduce((sum, m) => sum + m.importance, 0) / (data?.length || 1) || 0,
      };
    } catch (error: any) {
      throw new Error(`Memory stats error: ${error?.message || 'Unknown error'}`);
    }
  }

  async consolidate() {
    try {
      const memories = await this.recall('', 100);
      const semantic = memories.filter((m: any) => m.type === 'semantic');
      const summary = await this.summarize(semantic.map((m: any) => m.content).join('\n'));
      await this.store(summary, 'semantic', { consolidated: true });
      return { consolidated: true, summary };
    } catch (error: any) {
      throw new Error(`Memory consolidation error: ${error?.message || 'Unknown error'}`);
    }
  }

  private async summarize(text: string): Promise<string> {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: 'Summarize the following memories into key facts.' },
          { role: 'user', content: text },
        ],
      });
      return response.choices[0].message.content || '';
    } catch (error: any) {
      throw new Error(`Summarize error: ${error?.message || 'Unknown error'}`);
    }
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const res = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
      return res.data[0].embedding;
    } catch (error: any) {
      throw new Error(`Generate embedding error: ${error?.message || 'Unknown error'}`);
    }
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

// Conversation History
export class ConversationHistory {
  private agentId: string;

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  async addMessage(role: 'user' | 'assistant', content: string) {
    try {
      const { error } = await supabase
        .from('conversation_history')
        .insert({
          agent_id: this.agentId,
          role,
          content,
          timestamp: new Date().toISOString(),
        });

      if (error) throw error;
    } catch (error: any) {
      throw new Error(`Add message error: ${error?.message || 'Unknown error'}`);
    }
  }

  async getHistory(limit = 50) {
    try {
      const { data, error } = await supabase
        .from('conversation_history')
        .select('*')
        .eq('agent_id', this.agentId)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []).reverse();
    } catch (error: any) {
      throw new Error(`Get history error: ${error?.message || 'Unknown error'}`);
    }
  }

  async clearHistory() {
    try {
      const { error } = await supabase
        .from('conversation_history')
        .delete()
        .eq('agent_id', this.agentId);

      if (error) throw error;
    } catch (error: any) {
      throw new Error(`Clear history error: ${error?.message || 'Unknown error'}`);
    }
  }
}

// Knowledge Graph
export class KnowledgeGraph {
  private agentId: string;

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  async addEntity(name: string, type: string, properties?: Record<string, any>) {
    try {
      const { data, error } = await supabase
        .from('entities')
        .insert({
          agent_id: this.agentId,
          name,
          type,
          properties,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error: any) {
      throw new Error(`Add entity error: ${error?.message || 'Unknown error'}`);
    }
  }

  async addRelation(fromEntity: string, toEntity: string, relationType: string) {
    try {
      const { data, error } = await supabase
        .from('relations')
        .insert({
          agent_id: this.agentId,
          from_entity: fromEntity,
          to_entity: toEntity,
          relation_type: relationType,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error: any) {
      throw new Error(`Add relation error: ${error?.message || 'Unknown error'}`);
    }
  }

  async getEntity(name: string) {
    try {
      const { data, error } = await supabase
        .from('entities')
        .select('*')
        .eq('agent_id', this.agentId)
        .eq('name', name)
        .single();

      if (error) throw error;
      return data;
    } catch (error: any) {
      throw new Error(`Get entity error: ${error?.message || 'Unknown error'}`);
    }
  }

  async getRelations(entityName: string) {
    try {
      const { data, error } = await supabase
        .from('relations')
        .select('*')
        .eq('agent_id', this.agentId)
        .or(`from_entity.eq.${entityName},to_entity.eq.${entityName}`);

      if (error) throw error;
      return data;
    } catch (error: any) {
      throw new Error(`Get relations error: ${error?.message || 'Unknown error'}`);
    }
  }

  async getGraph() {
    try {
      const { data: entities, error: entitiesError } = await supabase
        .from('entities')
        .select('*')
        .eq('agent_id', this.agentId);

      if (entitiesError) throw entitiesError;

      const { data: relations, error: relationsError } = await supabase
        .from('relations')
        .select('*')
        .eq('agent_id', this.agentId);

      if (relationsError) throw relationsError;

      return { entities: entities || [], relations: relations || [] };
    } catch (error: any) {
      throw new Error(`Get graph error: ${error?.message || 'Unknown error'}`);
    }
  }
}
