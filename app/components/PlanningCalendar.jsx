'use client'
// FullCalendar + ses plugins (~200-400 Ko) isolés ici et chargés À LA DEMANDE
// (next/dynamic, ssr:false depuis /planning) → hors du bundle initial de la page.
// La config statique (vues, créneaux, toolbar) reste ici ; seules les valeurs
// dynamiques (vue courante, événements, handlers) passent en props.
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import luxonPlugin from '@fullcalendar/luxon3'
import frLocale from '@fullcalendar/core/locales/fr'

export default function PlanningCalendar({ calendarView, events, onDateClick, onEventClick }) {
  return (
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, luxonPlugin]}
      initialView={calendarView}
      locale={frLocale}
      timeZone="Europe/Paris"
      headerToolbar={{
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,listWeek'
      }}
      buttonText={{ today: "Auj.", month: 'Mois', week: 'Sem.', list: 'Liste' }}
      events={events}
      dateClick={onDateClick}
      eventClick={onEventClick}
      height="calc(100vh - 180px)"
      slotMinTime="06:00:00"
      slotMaxTime="23:00:00"
      slotDuration="00:30:00"
      allDayText="Journée"
      nowIndicator={true}
      dayMaxEvents={3}
      eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false }}
    />
  )
}
