export async function readHealthResponse(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || `Statusul surselor AI nu a putut fi incarcat (HTTP ${response.status}). Apasa Reincarca. Aceasta eroare nu confirma esecul salvarii documentului.`);
  }
  if (!data || !Array.isArray(data.cards) || !Array.isArray(data.recentAudits) || !Array.isArray(data.warnings)) {
    throw new Error('Serverul nu a returnat statusul surselor AI. Apasa Reincarca. Verifica biblioteca RAG inainte sa incarci din nou documentul.');
  }
  return data;
}
