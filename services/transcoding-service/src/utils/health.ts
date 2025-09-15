export class HealthMonitor {
  private serviceName: string;
  private version: string;
  private checks: Array<() => Promise<boolean>> = [];

  constructor(serviceName: string, version?: string) {
    this.serviceName = serviceName;
    this.version = version || '1.0.0';
  }

  addCheck(checkFn: () => Promise<boolean>): void {
    this.checks.push(checkFn);
  }

  static memoryCheck(threshold: number = 85): () => Promise<boolean> {
    return async () => {
      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
      const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
      const percentage = (heapUsedMB / heapTotalMB) * 100;
      return percentage < threshold;
    };
  }

  static redisCheck(checkFn: () => Promise<boolean>): () => Promise<boolean> {
    return checkFn;
  }

  async getHealth(): Promise<{
    service: string;
    version: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    checks: Record<string, boolean>;
  }> {
    const results: Record<string, boolean> = {};
    let healthyCount = 0;

    for (let i = 0; i < this.checks.length; i++) {
      try {
        const result = await this.checks[i]();
        results[`check_${i}`] = result;
        if (result) healthyCount++;
      } catch (error) {
        results[`check_${i}`] = false;
      }
    }

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (healthyCount === 0) {
      status = 'unhealthy';
    } else if (healthyCount < this.checks.length) {
      status = 'degraded';
    }

    return {
      service: this.serviceName,
      version: this.version,
      status,
      timestamp: new Date().toISOString(),
      checks: results
    };
  }
}