import React, { useEffect, useState } from "react";
import ConfirmModal from "./ConfirmModal.jsx";
import { setBeforeUnloadGuard } from "./data.js";
import { t } from "./locale.js";

// Sortie d'une page qui tient du travail vivant seulement dans l'onglet :
// l'éditeur (script non téléchargé) et l'enregistrement (prises hors ZIP).
//
// Deux couches, parce que le navigateur n'en laisse habiller qu'une :
//  - un lien du site : clic intercepté ici, modal du thème, qui peut en plus
//    proposer de télécharger avant de partir ;
//  - un rechargement, une URL tapée, un favori, la fermeture de l'onglet :
//    seul `beforeunload` réagit et son dialogue appartient au navigateur
//    (message et style imposés depuis Chrome 51 / Firefox 44). On le garde
//    comme filet : sans lui, un F5 perdrait le travail sans un mot.
//
// Rien n'est jamais persisté en local : un brouillon oublié dans le
// navigateur redeviendrait une source de vérité périmée face au dépôt.
export default function LeaveGuard({ active, title, children, saveLabel, onSave }) {
  // Url du lien cliqué, mise en attente le temps de la réponse.
  const [leaveTo, setLeaveTo] = useState(null);

  useEffect(() => {
    setBeforeUnloadGuard(active);
    return () => setBeforeUnloadGuard(false);
  }, [active]);

  // Écoute sur le document en phase capture plutôt qu'un branchement lien par
  // lien : les liens à venir sont couverts d'office.
  useEffect(() => {
    if (!active) return;
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0) return;
      // Clic modifié : l'utilisateur demande un nouvel onglet, on ne part pas.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      // Ancre interne : pas de navigation, rien à perdre.
      if (url.origin === window.location.origin && url.pathname === window.location.pathname) {
        return;
      }
      e.preventDefault();
      setLeaveTo(url.href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [active]);

  // Le modal reste affiché jusqu'à la navigation, même quand `active` retombe
  // (le téléchargement solde la page juste avant qu'on la quitte).
  if (!leaveTo) return null;

  // Départ pour de bon : on retire le garde à la main au lieu d'attendre son
  // effet, sinon le dialogue natif se superpose au modal.
  const leaveNow = () => {
    setBeforeUnloadGuard(false);
    window.location.href = leaveTo;
  };

  return (
    <ConfirmModal
      title={title}
      primaryLabel={saveLabel}
      onPrimary={async () => {
        await onSave();
        // Laisser le navigateur démarrer le téléchargement : décharger la
        // page dans la même tâche peut l'annuler.
        window.setTimeout(leaveNow, 200);
      }}
      confirmLabel={t("common.leaveAnyway")}
      onConfirm={leaveNow}
      onCancel={() => setLeaveTo(null)}
    >
      {children}
    </ConfirmModal>
  );
}
