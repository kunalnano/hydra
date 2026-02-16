export interface HealRule {
  id: string
  name: string
  description: string
  enabled: boolean
}

export const DEFAULT_RULES: HealRule[] = [
  {
    id: 'process_disappeared',
    name: 'Process Disappeared',
    description: 'A known process group disappeared between monitor cycles',
    enabled: true
  },
  {
    id: 'port_disappeared',
    name: 'Port Stopped Listening',
    description: 'A previously listening port is no longer active',
    enabled: true
  },
  {
    id: 'high_cpu',
    name: 'High CPU Usage',
    description: 'System CPU exceeds 90%',
    enabled: true
  },
  {
    id: 'high_memory',
    name: 'High Memory Usage',
    description: 'System memory exceeds 90%',
    enabled: true
  },
  {
    id: 'agent_waiting_long',
    name: 'Agent Waiting Too Long',
    description: 'An AI agent has been in waiting status for extended time',
    enabled: true
  }
]
