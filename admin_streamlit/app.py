"""Операционный центр и админ-панель «Вектор» на Streamlit."""

from __future__ import annotations

import json
import os
from typing import Any

import pandas as pd
import streamlit as st

try:
    from admin_streamlit.api_client import AdminApiClient, AdminApiError
    from admin_streamlit.ui_helpers import (
        AUTH_PROVIDER_LABELS,
        CHANNEL_LABELS,
        DISPUTE_STATUS_BADGES,
        DISPUTE_STATUS_LABELS,
        ESCROW_BADGES,
        ESCROW_LABELS,
        METHOD_LABELS,
        PAYOUT_STATUS_BADGES,
        PAYOUT_STATUS_LABELS,
        REASON_LABELS,
        REQUEST_STATUS_BADGES,
        REQUEST_STATUS_LABELS,
        ROLE_BADGES,
        ROLE_LABELS,
        build_channels_chart,
        build_gmv_chart,
        csv_bytes,
        fmt_dt,
        fmt_dt_short,
        fmt_rub,
        inject_styles,
        selected_row_idx,
    )
except ModuleNotFoundError:  # Запуск напрямую из admin_streamlit/
    from api_client import AdminApiClient, AdminApiError
    from ui_helpers import (
        AUTH_PROVIDER_LABELS,
        CHANNEL_LABELS,
        DISPUTE_STATUS_BADGES,
        DISPUTE_STATUS_LABELS,
        ESCROW_BADGES,
        ESCROW_LABELS,
        METHOD_LABELS,
        PAYOUT_STATUS_BADGES,
        PAYOUT_STATUS_LABELS,
        REASON_LABELS,
        REQUEST_STATUS_BADGES,
        REQUEST_STATUS_LABELS,
        ROLE_BADGES,
        ROLE_LABELS,
        build_channels_chart,
        build_gmv_chart,
        csv_bytes,
        fmt_dt,
        fmt_dt_short,
        fmt_rub,
        inject_styles,
        selected_row_idx,
    )

st.set_page_config(
    page_title="Вектор — Операционный центр",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded",
)

NAV_SECTIONS = [
    ("overview", "📊", "Главная"),
    ("disputes", "⚖️", "Споры и возвраты"),
    ("tutors", "🧑‍🏫", "Репетиторы"),
    ("payouts", "💸", "Выплаты НПД"),
    ("feedback", "💬", "Обратная связь"),
    ("system", "👥", "Пользователи и система"),
]

_SHORT_REQ_STATUS = {
    "pending": "🟡 Ждёт",
    "offered": "🟠 Торг",
    "accepted": "🟢 Подтв.",
    "completed": "🏁 Прошёл",
    "declined": "❌ Откл.",
    "refunded": "↩️ Возврат",
}
_SHORT_ESCROW = {
    "none": "⚪ Нет",
    "frozen": "🔒 Резерв",
    "captured": "🟢 Выплата",
    "refunded": "↩️ Возврат",
}
_SHORT_PAYOUT_STATUS = {
    "processing": "🟡 Ожидает",
    "pending": "🟡 Ожидает",
    "succeeded": "🟢 Выплачена",
    "paid": "🟢 Выплачена",
    "rejected": "❌ Откл.",
    "failed": "❌ Ошибка",
}


def _get_client(base_url: str, admin_token: str) -> AdminApiClient:
    sig = (base_url.strip().rstrip("/"), admin_token.strip())
    cached_sig = st.session_state.get("api_client_sig")
    cached_client = st.session_state.get("api_client")
    if cached_client is not None and cached_sig == sig:
        return cached_client
    if cached_client is not None:
        try:
            cached_client.close()
        except Exception:
            pass
    client = AdminApiClient(base_url=sig[0], admin_token=sig[1])
    st.session_state["api_client"] = client
    st.session_state["api_client_sig"] = sig
    return client


def _match_query(item: dict[str, Any], query: str, fields: tuple[str, ...]) -> bool:
    q = (query or "").strip().lower()
    if not q:
        return True
    for f in fields:
        val = str(item.get(f) or "").lower()
        if q in val:
            return True
    return False


def _navigate(section_id: str) -> None:
    st.session_state["nav_section"] = section_id
    st.rerun()


def _notify_done(msg: str) -> None:
    st.toast(msg, icon="✅")
    st.rerun()


# ---------- Модальные диалоги подтверждения критичных действий ----------

@st.dialog("Подтвердить возврат 100%")
def _dialog_refund_dispute(client: AdminApiClient, dsp: dict[str, Any], note: str) -> None:
    amount = fmt_rub(dsp.get("amountRub"))
    st.markdown(
        f"Вернуть **{amount}** на кошелёк ученика **{dsp.get('studentName') or 'Ученик'}**?\n\n"
        f"- **Спор:** `{dsp.get('id')}` (бронь `{dsp.get('bookingId')}`)\n"
        f"- **Преподаватель:** {dsp.get('tutorName') or '—'}\n"
        f"- **Причина:** {REASON_LABELS.get(str(dsp.get('reason')), str(dsp.get('reason')))}"
    )
    if note.strip():
        st.caption(f"Комментарий решения: {note.strip()}")
    c1, c2 = st.columns(2)
    if c1.button("💸 Провести возврат", type="primary", width="stretch"):
        try:
            client.resolve_dispute(dsp["id"], "refund", resolution_note=note.strip())
            _notify_done(f"Возврат {amount} зачислен ученику")
        except AdminApiError as exc:
            st.error(exc.message)
    if c2.button("Отмена", width="stretch"):
        st.rerun()


@st.dialog("Возврат средств с эскроу")
def _dialog_refund_request(client: AdminApiClient, req: dict[str, Any]) -> None:
    amount = fmt_rub(req.get("finalPriceRub") or req.get("offerPriceRub"))
    st.markdown(
        f"Перевести заявку `{req.get('id')}` в статус **Возврат средств**?\n\n"
        f"- **Ученик:** {req.get('studentName')}\n"
        f"- **Преподаватель:** {req.get('tutorName')}\n"
        f"- **Сумма заявки:** {amount}"
    )
    c1, c2 = st.columns(2)
    if c1.button("↩️ Вернуть средства", type="primary", width="stretch"):
        try:
            client.set_request_status(req["id"], "refunded")
            _notify_done(f"По заявке {req['id']} оформлен возврат")
        except AdminApiError as exc:
            st.error(exc.message)
    if c2.button("Отмена", width="stretch"):
        st.rerun()


@st.dialog("Подтвердить выплату НПД")
def _dialog_pay_payout(client: AdminApiClient, pay: dict[str, Any]) -> None:
    amount = fmt_rub(pay.get("amountRub"))
    st.markdown(
        f"Отметить выплату **{amount}** преподавателю **{pay.get('tutorName')}** как проведённую?\n\n"
        f"- **ID выплаты:** `{pay.get('id')}`\n"
        f"- **Способ:** {METHOD_LABELS.get(str(pay.get('method')), str(pay.get('method')))} ({pay.get('bank') or '—'})\n"
        f"- **Реквизиты:** `{pay.get('destinationMasked') or '—'}`\n"
        f"- **Чек НПД:** `{pay.get('npdReceipt') or 'не сформирован'}`"
    )
    c1, c2 = st.columns(2)
    if c1.button("✅ Выплачено", type="primary", width="stretch"):
        try:
            client.set_payout_status(pay["id"], "succeeded")
            _notify_done(f"Выплата {amount} подтверждена")
        except AdminApiError as exc:
            st.error(exc.message)
    if c2.button("Отмена", width="stretch"):
        st.rerun()


@st.dialog("Выдать права администратора")
def _dialog_grant_admin(client: AdminApiClient, user: dict[str, Any]) -> None:
    st.warning(
        f"Пользователь **{user.get('displayName') or user.get('username')}** (`@{user.get('username')}`) "
        "получит полный доступ к админ-API, модерации и возвратам."
    )
    c1, c2 = st.columns(2)
    if c1.button("🛡 Назначить админом", type="primary", width="stretch"):
        try:
            client.set_user_role(int(user["id"]), "admin")
            _notify_done(f"Пользователь @{user.get('username')} назначен администратором")
        except AdminApiError as exc:
            st.error(exc.message)
    if c2.button("Отмена", width="stretch"):
        st.rerun()


@st.dialog("Подтвердить возврат через ЮKassa")
def _dialog_yookassa_refund(
    client: AdminApiClient,
    *,
    mode: str,
    target_id: str,
    amount_rub: int,
    user_label: str,
    reason: str = "",
) -> None:
    st.markdown(
        f"Отправить банковский возврат **{fmt_rub(amount_rub)}** пользователю **{user_label}** через ЮKassa (`POST /v3/refunds`)?\n\n"
        f"- **Идентификатор:** `{target_id}`\n"
        + (f"- **Причина / заметка:** {reason}" if reason.strip() else "")
    )
    c1, c2 = st.columns(2)
    if c1.button("↩️ Подтвердить возврат", type="primary", width="stretch"):
        try:
            if mode == "payment":
                res = client.create_payment_refund(target_id, amount=amount_rub, reason=reason)
            else:
                res = client.dispatch_refund(target_id, review_note=reason)
            st_out = (res.get("refund") or {}).get("status") or "pending"
            _notify_done(f"Возврат {fmt_rub(amount_rub)} отправлен ({st_out})")
        except AdminApiError as exc:
            st.error(exc.message)
    if c2.button("Отмена", width="stretch"):
        st.rerun()


# ---------- Боковая панель ----------

def _render_connection_controls(container: Any, key_prefix: str) -> tuple[str, str]:
    default_url = (os.environ.get("ADMIN_API_BASE_URL") or "http://127.0.0.1:8770").strip()
    default_tok = (os.environ.get("ADMIN_API_TOKEN") or os.environ.get("VEKTOR_ADMIN_TOKEN") or "").strip()

    if "cfg_api_url" not in st.session_state:
        st.session_state["cfg_api_url"] = default_url
    if "cfg_api_token" not in st.session_state:
        st.session_state["cfg_api_token"] = default_tok

    base_url = container.text_input("URL бэкенда", value=st.session_state["cfg_api_url"], key=f"{key_prefix}_url")
    admin_token = container.text_input(
        "Токен X-Admin-Token",
        value=st.session_state["cfg_api_token"],
        type="password",
        key=f"{key_prefix}_tok",
        help="Задаётся через ADMIN_API_TOKEN на сервере.",
    )
    st.session_state["cfg_api_url"] = base_url
    st.session_state["cfg_api_token"] = admin_token
    return base_url, admin_token


def _render_session_form(container: Any, client: AdminApiClient, key_prefix: str) -> None:
    with container.form(f"{key_prefix}_login_form", clear_on_submit=False):
        u_name = st.text_input("Логин админа", placeholder="admin", key=f"{key_prefix}_user")
        u_pass = st.text_input("Пароль", type="password", key=f"{key_prefix}_pass")
        c_in, c_out = st.columns(2)
        login_sub = c_in.form_submit_button("Войти", width="stretch")
        logout_sub = c_out.form_submit_button("Выйти", width="stretch")
    if login_sub:
        if not u_name.strip() or not u_pass:
            container.warning("Введите логин и пароль администратора.")
        else:
            try:
                client.login_session(u_name.strip(), u_pass)
                st.toast("Сессия администратора открыта", icon="🔓")
                st.rerun()
            except AdminApiError as exc:
                container.error(exc.message)
    if logout_sub:
        try:
            client.logout_session()
            st.toast("Вышли из сессии", icon="🔒")
            st.rerun()
        except AdminApiError as exc:
            container.error(exc.message)


def _render_sidebar() -> tuple[AdminApiClient, dict[str, Any] | None, str | None, str]:
    default_url = (os.environ.get("ADMIN_API_BASE_URL") or "http://127.0.0.1:8770").strip()
    default_tok = (os.environ.get("ADMIN_API_TOKEN") or os.environ.get("VEKTOR_ADMIN_TOKEN") or "").strip()

    base_url = st.session_state.get("cfg_api_url", default_url)
    admin_token = st.session_state.get("cfg_api_token", default_tok)
    client = _get_client(base_url, admin_token)

    ping_info: dict[str, Any] | None = None
    ping_err: str | None = None
    overview_data: dict[str, Any] | None = None
    try:
        ping_info = client.ping()
        overview_data = client.overview()
    except AdminApiError as exc:
        ping_err = f"{exc.message} (HTTP {exc.status_code})" if exc.status_code else exc.message

    kpi = (overview_data or {}).get("kpi") or {}
    badges = {
        "disputes": int(kpi.get("openDisputesCount") or 0),
        "tutors": int(kpi.get("newTutorApplicationsCount") or 0),
        "payouts": int(kpi.get("pendingRefundsCount") or 0),
        "feedback": int(kpi.get("newFeedbackCount") or 0),
    }

    valid_sections = {sec_id for sec_id, _, _ in NAV_SECTIONS}
    if st.session_state.get("nav_section") not in valid_sections:
        st.session_state["nav_section"] = "overview"
    active_sec = st.session_state["nav_section"]

    with st.sidebar:
        st.markdown("## ⚡ Вектор")
        st.caption("Операционный центр")

        if ping_info:
            mode = str(ping_info.get("authMode") or "open")
            mode_short = {"token": "по токену", "session": "сессия админа", "open": "open-режим"}.get(mode, mode)
            st.markdown(f"**🟢 API подключён** · `{mode_short}`")
        else:
            st.markdown("**🔴 Нет подключения к API**")

        st.divider()

        for sec_id, ico, label in NAV_SECTIONS:
            cnt = badges.get(sec_id, 0)
            btn_label = f"{ico} {label} ({cnt})" if cnt > 0 else f"{ico} {label}"
            if st.button(
                btn_label,
                key=f"nav_{sec_id}",
                type="primary" if active_sec == sec_id else "secondary",
                width="stretch",
            ):
                _navigate(sec_id)

        st.divider()
        if st.button("🔄 Обновить данные", width="stretch"):
            st.rerun()

        with st.popover("⚙️ Подключение и вход", width="stretch"):
            new_url, new_tok = _render_connection_controls(st, "sb_cfg")
            if (new_url.strip().rstrip("/"), new_tok.strip()) != (base_url.strip().rstrip("/"), admin_token.strip()):
                client = _get_client(new_url, new_tok)
                st.rerun()
            st.divider()
            _render_session_form(st, client, "sb_auth")

    return client, overview_data, ping_err, active_sec


# ---------- Раздел 1: Главная и очередь действий ----------

def _render_overview(client: AdminApiClient, overview: dict[str, Any]) -> None:
    st.title("Операционный центр «Вектор»")
    kpi = overview.get("kpi") or {}
    storage = overview.get("storage") or {}

    # Подтягиваем точные счётчики очередей для Action Center
    try:
        tutors = client.tutors(limit=300)
    except AdminApiError:
        tutors = []
    try:
        payouts = client.payouts(limit=300)
    except AdminApiError:
        payouts = []

    open_dsp = int(kpi.get("openDisputesCount") or 0)
    pend_req = int(kpi.get("pendingRequestsCount") or 0)
    pend_ref = int(kpi.get("pendingRefundsCount") or 0)
    new_fb = int(kpi.get("newFeedbackCount") or 0)
    unver_tutors = sum(1 for t in tutors if not t.get("verified"))
    proc_payouts = [p for p in payouts if p.get("status") in ("processing", "pending")]
    proc_payout_sum = sum(int(p.get("amountRub") or 0) for p in proc_payouts)
    urgent_total = open_dsp + unver_tutors + len(proc_payouts) + pend_ref + new_fb

    m1, m2, m3, m4 = st.columns(4)
    with m1.container(border=True):
        st.metric("Оборот (GMV)", fmt_rub(kpi.get("gmvRub")))
        st.caption(f"Автозаявок: {int(kpi.get('requestsCount') or 0) - pend_req} подтв. из {int(kpi.get('requestsCount') or 0)}")
    with m2.container(border=True):
        st.metric("Доход платформы (5%)", fmt_rub(kpi.get("feeRub")))
        st.caption(
            f"Репетиторам 94%: {fmt_rub(kpi.get('payoutRub'))} · СБП 1%: {fmt_rub(kpi.get('sbpFeeRub'))}"
        )
    with m3.container(border=True):
        st.metric("К выплате НПД", fmt_rub(proc_payout_sum))
        st.caption(f"В очереди: {len(proc_payouts)} выплат · Всего: {int(kpi.get('payoutsCount') or 0)}")
    with m4.container(border=True):
        st.metric("Требует действий", f"{urgent_total} шт.")
        st.caption(f"Людей: {int(kpi.get('usersCount') or 0)} · Анкет: {int(kpi.get('tutorsCount') or 0)}")

    st.subheader("Требует внимания прямо сейчас")
    q1, q2, q3, q4 = st.columns(4)

    with q1.container(border=True):
        st.markdown('<p class="adm-card-title">⚖️ Споры и возвраты</p>', unsafe_allow_html=True)
        st.metric("Ожидают решения", f"{open_dsp} шт.")
        st.caption("Гарантия 1-го урока и возвраты" if open_dsp else "✓ Все споры разобраны")
        if st.button("Разобрать споры →", key="act_go_dsp", type="primary" if open_dsp else "secondary", width="stretch"):
            _navigate("disputes")

    with q2.container(border=True):
        st.markdown('<p class="adm-card-title">🧑‍🏫 Проверка анкет</p>', unsafe_allow_html=True)
        st.metric("На проверке", f"{unver_tutors} шт.")
        st.caption("Выдача синей галочки" if unver_tutors else "✓ Все анкеты проверены")
        if st.button("Проверить анкеты →", key="act_go_tut", type="primary" if unver_tutors else "secondary", width="stretch"):
            _navigate("tutors")

    with q3.container(border=True):
        st.markdown('<p class="adm-card-title">💸 Выплаты и возвраты</p>', unsafe_allow_html=True)
        st.metric("В очереди", f"{len(proc_payouts) + pend_ref} шт.")
        st.caption(
            (f"Выплаты НПД: {fmt_rub(proc_payout_sum)}" if proc_payouts else "✓ Выплаты проведены")
            + (f" · Возвраты ЮKassa: {pend_ref} шт." if pend_ref else "")
        )
        if st.button("Перейти к выплатам →", key="act_go_pay", type="primary" if (proc_payouts or pend_ref) else "secondary", width="stretch"):
            _navigate("payouts")

    with q4.container(border=True):
        st.markdown('<p class="adm-card-title">💬 Обратная связь</p>', unsafe_allow_html=True)
        st.metric("Новых тикетов", f"{new_fb} шт.")
        st.caption("Баги и сотрудничество" if new_fb else "✓ Новых обращений нет")
        if st.button("Открыть тикеты →", key="act_go_fb", type="primary" if new_fb else "secondary", width="stretch"):
            _navigate("feedback")

    c_left, c_right = st.columns([3, 2])
    daily = overview.get("dailySeries") or []
    channels = overview.get("channelShare") or []

    with c_left.container(border=True):
        hdr_l, hdr_r = st.columns([5, 4])
        hdr_l.subheader("Динамика по дням")
        mode_pick = hdr_r.segmented_control(
            "Режим графика",
            ["Деньги (₽)", "Заявки"],
            default="Деньги (₽)",
            label_visibility="collapsed",
            key="ov_chart_mode",
        ) or "Деньги (₽)"
        if daily:
            chart_mode = "money" if mode_pick == "Деньги (₽)" else "count"
            st.altair_chart(build_gmv_chart(daily, mode=chart_mode), width="stretch")
        else:
            st.info("Данных по датам пока нет.")

    with c_right.container(border=True):
        st.subheader("Откуда приходят репетиторы")
        if channels:
            st.altair_chart(build_channels_chart(channels), width="stretch")
        else:
            st.info("Источники анкет пока не заполнены.")

    if daily:
        with st.expander("Детальная таблица по дням и выгрузка CSV"):
            df_daily = pd.DataFrame(daily).rename(
                columns={
                    "date": "Дата",
                    "gmvRub": "GMV ₽",
                    "payoutRub": "Репетиторам (94%) ₽",
                    "feeRub": "Комиссия (5%) ₽",
                    "sbpFeeRub": "Шлюз СБП (1%) ₽",
                    "requests": "Всего заявок",
                    "accepted": "Подтверждено",
                }
            )
            st.dataframe(
                df_daily,
                width="stretch",
                hide_index=True,
                column_config={
                    "GMV ₽": st.column_config.NumberColumn("GMV", format="%d ₽"),
                    "Репетиторам (94%) ₽": st.column_config.NumberColumn("Репетиторам (94%)", format="%d ₽"),
                    "Комиссия (5%) ₽": st.column_config.NumberColumn("Комиссия (5%)", format="%d ₽"),
                    "Шлюз СБП (1%) ₽": st.column_config.NumberColumn("Шлюз СБП (1%)", format="%d ₽"),
                },
            )
            st.download_button(
                "⬇ Скачать отчёт по дням (CSV)",
                data=csv_bytes(df_daily),
                file_name="vektor-daily-metrics.csv",
                mime="text/csv",
            )

    mode = str(storage.get("mode") or "sqlite")
    pg_ok = storage.get("postgresOk")
    st.caption(
        f"БД: **{mode}**"
        + (f" · PostgreSQL 17: **{'OK' if pg_ok else 'офлайн'}**" if pg_ok is not None else "")
        + f" · Outbox в очереди: **{int(kpi.get('outboxPending') or 0)}**"
    )


# ---------- Раздел 2: Споры, возвраты и журнал уроков ----------

def _render_disputes_tab(client: AdminApiClient) -> None:
    disputes = client.disputes(limit=250)
    if not disputes:
        st.info("Споров пока нет.")
        return

    open_list = [d for d in disputes if d.get("status") == "open"]
    ref_cnt = sum(1 for d in disputes if d.get("status") == "refunded")
    rej_cnt = sum(1 for d in disputes if d.get("status") == "rejected")
    open_sum = sum(int(d.get("amountRub") or 0) for d in open_list)

    c1, c2, c3, c4 = st.columns(4)
    c1.container(border=True).metric("Всего споров", len(disputes))
    c2.container(border=True).metric("Открытых сейчас", len(open_list))
    c3.container(border=True).metric("Сумма на разборе", fmt_rub(open_sum))
    c4.container(border=True).metric("Возвратов / Отклонено", f"{ref_cnt} / {rej_cnt}")

    st.subheader("Очередь открытых споров")
    if not open_list:
        st.success("✓ Открытых споров нет — все обращения разобраны.")
    else:
        for dsp in open_list:
            with st.container(border=True):
                h_l, h_r = st.columns([3, 1])
                h_l.markdown(
                    f"**Спор `{dsp.get('id')}`** · бронь `{dsp.get('bookingId')}` · "
                    f"{REASON_LABELS.get(str(dsp.get('reason')), str(dsp.get('reason')))}"
                )
                h_r.markdown(f"### {fmt_rub(dsp.get('amountRub'))}")
                st.caption(
                    f"Ученик: **{dsp.get('studentName') or 'Ученик'}** · "
                    f"Преподаватель: **{dsp.get('tutorName') or '—'}** · "
                    f"Гарантия 1-го урока: **{'Да' if dsp.get('firstLessonGuarantee') else 'Нет'}** · "
                    f"Создан: {fmt_dt(dsp.get('createdAt'))}"
                )
                st.info(f"Комментарий ученика: {dsp.get('comment') or '—'}")
                note_val = st.text_input(
                    "Комментарий решения администратора",
                    value="",
                    placeholder="Например: Возврат 100% на баланс ученика по гарантии 1-го урока",
                    key=f"dsp_note_{dsp['id']}",
                )
                b1, b2, _ = st.columns([1, 1, 2])
                if b1.button("💸 Вернуть 100% ученику", key=f"dsp_ref_{dsp['id']}", type="primary", width="stretch"):
                    _dialog_refund_dispute(client, dsp, note_val)
                if b2.button("❌ Отклонить спор", key=f"dsp_rej_{dsp['id']}", width="stretch"):
                    try:
                        client.resolve_dispute(dsp["id"], "reject", resolution_note=note_val)
                        _notify_done(f"Спор {dsp['id']} отклонён")
                    except AdminApiError as exc:
                        st.error(exc.message)

    st.divider()
    st.subheader("История всех споров")
    f1, f2 = st.columns([3, 2])
    status_pick = f1.pills(
        "Статус",
        ["all", "open", "refunded", "rejected"],
        default="all",
        format_func=lambda s: "Все" if s == "all" else DISPUTE_STATUS_LABELS.get(s, s),
        key="dsp_status_filter",
    ) or "all"
    search_q = f2.text_input("Поиск", placeholder="ID, бронь, ученик, репетитор или причина", key="dsp_search")

    filtered = [
        d for d in disputes
        if (status_pick == "all" or d.get("status") == status_pick)
        and _match_query(d, search_q, ("id", "bookingId", "tutorName", "studentName", "comment", "reason"))
    ]
    rows = [
        {
            "ID": d.get("id"),
            "Бронь": d.get("bookingId"),
            "Статус": DISPUTE_STATUS_BADGES.get(str(d.get("status")), str(d.get("status"))),
            "Ученик": d.get("studentName") or "—",
            "Преподаватель": d.get("tutorName") or "—",
            "Сумма": int(d.get("amountRub") or 0),
            "Причина": REASON_LABELS.get(str(d.get("reason")), str(d.get("reason"))),
            "Гарантия": "Да" if d.get("firstLessonGuarantee") else "Нет",
            "Комментарий": d.get("comment") or "—",
            "Решение": d.get("resolutionNote") or "—",
            "Создан": fmt_dt_short(d.get("createdAt")),
        }
        for d in filtered
    ]
    df = pd.DataFrame(rows)
    st.dataframe(
        df,
        width="stretch",
        hide_index=True,
        column_config={"Сумма": st.column_config.NumberColumn("Сумма", format="%d ₽")},
    )
    st.download_button("⬇ Скачать споры (CSV)", data=csv_bytes(df), file_name="vektor-disputes.csv", mime="text/csv")


def _render_lessons_log(client: AdminApiClient) -> None:
    st.caption(
        "Отклики и подтверждения уроков проходят автоматически между учеником и репетитором. "
        "Этот журнал нужен для сверки эскроу и ручного возврата в спорных случаях."
    )
    reqs = client.requests(limit=300)
    if not reqs:
        st.info("Записей по урокам пока нет.")
        return

    pend_cnt = sum(1 for r in reqs if r.get("status") in ("pending", "offered"))
    acc_cnt = sum(1 for r in reqs if r.get("status") in ("accepted", "completed"))
    frozen_sum = sum(int(r.get("finalPriceRub") or r.get("offerPriceRub") or 0) for r in reqs if r.get("escrowStatus") == "frozen")

    m1, m2, m3, m4 = st.columns(4)
    m1.container(border=True).metric("Всего уроков", len(reqs))
    m2.container(border=True).metric("Ждут ответа", pend_cnt)
    m3.container(border=True).metric("Подтверждены", acc_cnt)
    m4.container(border=True).metric("В резерве эскроу", fmt_rub(frozen_sum))

    st_pick = st.pills(
        "Статус урока",
        ["all", "pending", "accepted", "declined", "refunded"],
        default="all",
        format_func=lambda s: {"all": "Все", "pending": "Ждут ответа", "accepted": "Подтверждены", "declined": "Отклонены", "refunded": "Возврат"}.get(s, s),
        key="req_status_filter",
    ) or "all"
    c_esc, c_q = st.columns([1, 2])
    esc_pick = c_esc.selectbox(
        "Эскроу",
        ["all", "none", "frozen", "captured", "refunded"],
        format_func=lambda s: "Все эскроу" if s == "all" else ESCROW_LABELS.get(s, s),
        key="req_escrow_filter",
    )
    search_q = c_q.text_input("Поиск", placeholder="ID, ученик, репетитор, предмет или город", key="req_search")

    filtered = [
        r for r in reqs
        if (st_pick == "all" or r.get("status") == st_pick or (st_pick == "pending" and r.get("status") == "offered"))
        and (esc_pick == "all" or r.get("escrowStatus") == esc_pick)
        and _match_query(r, search_q, ("id", "studentName", "tutorName", "subject", "city"))
    ]

    if not filtered:
        st.info("По текущим фильтрам уроков не найдено.")
        return

    rows = [
        {
            "Ученик": r.get("studentName") or "—",
            "Преподаватель": r.get("tutorName") or "—",
            "Предмет": r.get("subject") or "—",
            "Слот": f"{fmt_dt_short(r.get('slotDate'))} · {r.get('hourSlot') or ''}",
            "Цена": int(r.get("finalPriceRub") or r.get("offerPriceRub") or 0),
            "Статус": _SHORT_REQ_STATUS.get(str(r.get("status")), str(r.get("status"))),
            "Эскроу": _SHORT_ESCROW.get(str(r.get("escrowStatus")), str(r.get("escrowStatus"))),
        }
        for r in filtered
    ]
    df = pd.DataFrame(rows)
    df_csv = pd.DataFrame(
        [
            {
                "ID": r.get("id"),
                **row,
                "Канал": CHANNEL_LABELS.get(str(r.get("messengerChannel")), str(r.get("messengerChannel") or "—")),
            }
            for r, row in zip(filtered, rows)
        ]
    )

    st.caption("Нажмите на строку в таблице, чтобы открыть ID урока, детали и возврат средств ниже")
    ev = st.dataframe(
        df,
        width="stretch",
        hide_index=True,
        on_select="rerun",
        selection_mode="single-row",
        key="req_table_sel",
        column_config={
            "Слот": st.column_config.TextColumn("Слот", width="small"),
            "Цена": st.column_config.NumberColumn("Цена", format="%d ₽", width="small"),
            "Статус": st.column_config.TextColumn("Статус", width="small"),
            "Эскроу": st.column_config.TextColumn("Эскроу", width="small"),
        },
    )
    st.download_button("⬇ Скачать журнал уроков (CSV)", data=csv_bytes(df_csv), file_name="vektor-lessons.csv", mime="text/csv")

    sel = filtered[selected_row_idx(ev, len(filtered))]
    offer = int(sel.get("offerPriceRub") or 0)
    final_p = int(sel.get("finalPriceRub") or sel.get("counterPriceRub") or offer)
    fee_est = (final_p * 5 + 50) // 100 if final_p > 0 else 0
    sbp_est = (final_p * 1 + 50) // 100 if final_p > 0 else 0
    payout_est = max(0, final_p - fee_est - sbp_est)
    cur_st = str(sel.get("status") or "pending")

    with st.container(border=True):
        c_info, c_act = st.columns([3, 2], gap="large")
        with c_info:
            st.markdown(f"#### Урок `{sel.get('id')}`")
            st.markdown(
                f"**{REQUEST_STATUS_BADGES.get(cur_st, cur_st)}** · "
                f"{ESCROW_BADGES.get(str(sel.get('escrowStatus')), str(sel.get('escrowStatus')))}"
            )
            st.markdown(
                f"- **Ученик:** {sel.get('studentName') or '—'}\n"
                f"- **Преподаватель:** {sel.get('tutorName') or '—'}\n"
                f"- **Предмет:** {sel.get('subject') or '—'} ({sel.get('city') or 'Якутск'})\n"
                f"- **Дата и час:** {fmt_dt(sel.get('slotDate'))} · **{sel.get('hourSlot') or '—'}** · "
                f"**Канал:** {CHANNEL_LABELS.get(str(sel.get('messengerChannel')), str(sel.get('messengerChannel') or '—'))}\n"
                f"- **Ставка ученика:** {fmt_rub(offer)} · **Итого:** {fmt_rub(final_p)} "
                f"(репетитору {fmt_rub(payout_est)} · комиссия {fmt_rub(fee_est)} · СБП {fmt_rub(sbp_est)})"
            )
            if sel.get("note"):
                st.info(f"Пожелание: {sel.get('note')}")
        with c_act:
            st.markdown("**Возврат и ручное вмешательство**")
            st.caption("В норме статусы переключаются автоматически; используйте кнопки ниже только по спору или инциденту.")
            if st.button(
                "↩️ Сделать ручной возврат",
                key=f"req_ref_{sel['id']}",
                type="primary" if cur_st != "refunded" else "secondary",
                disabled=cur_st == "refunded",
                width="stretch",
            ):
                _dialog_refund_request(client, sel)
            with st.expander("Экстренная смена статуса"):
                b1, b2 = st.columns(2)
                if b1.button("✅ Подтвердить", key=f"req_acc_{sel['id']}", disabled=cur_st == "accepted", width="stretch"):
                    try:
                        client.set_request_status(sel["id"], "accepted")
                        _notify_done(f"Урок {sel['id']} подтверждён")
                    except AdminApiError as exc:
                        st.error(exc.message)
                if b2.button("❌ Отклонить", key=f"req_dec_{sel['id']}", disabled=cur_st == "declined", width="stretch"):
                    try:
                        client.set_request_status(sel["id"], "declined")
                        _notify_done(f"Урок {sel['id']} отклонён")
                    except AdminApiError as exc:
                        st.error(exc.message)


def _render_disputes(client: AdminApiClient) -> None:
    st.title("Споры и возвраты (гарантия 1-го урока)")
    tab_dsp, tab_log = st.tabs(["⚖️ Споры и возвраты", "📋 Журнал уроков (автоматические)"])
    with tab_dsp:
        _render_disputes_tab(client)
    with tab_log:
        _render_lessons_log(client)


# ---------- Раздел 4: Модерация репетиторов и проверка дипломов ----------

_VERIF_DOC_LABELS = {
    "diploma": "Диплом о высшем образовании",
    "ege_expert": "Сертификат эксперта ЕГЭ / ФИПИ",
    "certificate": "Диплом или сертификат курса",
    "other": "Другой подтверждающий документ",
}

_VERIF_STATUS_BADGES = {
    "pending": "⏳ На проверке",
    "approved": "✅ Одобрен",
    "rejected": "❌ Отклонён",
}


def _render_tutor_catalog(client: AdminApiClient, tutors: list[dict[str, Any]]) -> None:
    if not tutors:
        st.info("Анкет репетиторов пока нет.")
        return

    f1, f2 = st.columns([3, 1])
    ver_pick = f1.pills(
        "Верификация",
        ["all", "unverified", "verified"],
        default="all",
        format_func=lambda v: {"all": "Все", "unverified": "На проверке", "verified": "Проверенные"}[v],
        key="tut_ver_filter",
    ) or "all"
    bump_pick = f2.selectbox(
        "Выдача",
        ["all", "bumped", "regular"],
        format_func=lambda b: {"all": "Все анкеты", "bumped": "Подняты в топ 🚀", "regular": "Обычная выдача"}[b],
        key="tut_bump_filter",
    )
    f3, f4 = st.columns([3, 2])
    search_q = f3.text_input("Поиск", placeholder="Имя, предмет, город или мессенджер", key="tut_search")
    view_mode = f4.segmented_control(
        "Режим работы",
        ["Карточка анкеты", "Быстрая правка"],
        default="Карточка анкеты",
        key="tut_view_mode",
    ) or "Карточка анкеты"

    filtered = [
        t for t in tutors
        if (ver_pick == "all" or (ver_pick == "verified" and t.get("verified")) or (ver_pick == "unverified" and not t.get("verified")))
        and (bump_pick == "all" or (bump_pick == "bumped" and t.get("bumpedToday")) or (bump_pick == "regular" and not t.get("bumpedToday")))
        and _match_query(t, search_q, ("id", "fullName", "subject", "city", "sourceChannel", "telegramHandle", "whatsappPhone"))
    ]

    if not filtered:
        st.info("По выбранным фильтрам анкет не найдено.")
        return

    if view_mode == "Быстрая правка":
        st.caption("Отметьте галочки прямо в таблице и нажмите «Сохранить изменения» внизу.")
        edit_rows = [
            {
                "id": t.get("id"),
                "Преподаватель": t.get("fullName"),
                "Предмет": t.get("subject"),
                "Город": t.get("city"),
                "Ставка": int(t.get("baseRateRub") or 0),
                "Проверен": bool(t.get("verified")),
                "В топе": bool(t.get("bumpedToday")),
            }
            for t in filtered
        ]
        df_edit = pd.DataFrame(edit_rows)
        edited = st.data_editor(
            df_edit,
            width="stretch",
            hide_index=True,
            disabled=["id", "Преподаватель", "Предмет", "Город", "Ставка"],
            column_config={
                "id": st.column_config.TextColumn("ID"),
                "Ставка": st.column_config.NumberColumn("Ставка", format="%d ₽"),
                "Проверен": st.column_config.CheckboxColumn("Проверен ✅"),
                "В топе": st.column_config.CheckboxColumn("Топ 🚀"),
            },
            key="tut_bulk_editor",
        )
        if st.button("💾 Сохранить массовые изменения", type="primary"):
            changed = 0
            orig_by_id = {str(t["id"]): t for t in filtered}
            try:
                for _, row in edited.iterrows():
                    tid = str(row["id"])
                    orig = orig_by_id.get(tid)
                    if not orig:
                        continue
                    v_new = bool(row["Проверен"])
                    b_new = bool(row["В топе"])
                    if (
                        v_new != bool(orig.get("verified"))
                        or b_new != bool(orig.get("bumpedToday"))
                    ):
                        client.moderate_tutor(tid, verified=v_new, bumped=b_new)
                        changed += 1
                if changed:
                    _notify_done(f"Обновлено анкет: {changed}")
                else:
                    st.info("Изменений не обнаружено.")
            except AdminApiError as exc:
                st.error(exc.message)
        return

    rows = [
        {
            "Преподаватель": t.get("fullName") or "—",
            "Предмет": t.get("subject") or "—",
            "Город": t.get("city") or "—",
            "Ставка": int(t.get("baseRateRub") or 0),
            "Рейтинг": f"{float(t.get('rating') or 0.0):.1f} ★ ({int(t.get('reviewsCount') or 0)})",
            "Статус": "✅ Проверен" if t.get("verified") else "⏳ Проверка",
            "Выдача": "🚀 В топе" if t.get("bumpedToday") else "Обычная",
        }
        for t in filtered
    ]
    df = pd.DataFrame(rows)
    df_csv = pd.DataFrame(
        [
            {
                **row,
                "Отзывы": int(t.get("reviewsCount") or 0),
                "Топ": "🚀 Да" if t.get("bumpedToday") else "—",
                "Источник": CHANNEL_LABELS.get(str(t.get("sourceChannel")), str(t.get("sourceChannel") or "—")),
            }
            for t, row in zip(filtered, rows)
        ]
    )

    st.caption("Нажмите на анкету в таблице, чтобы посмотреть контакты и промодерировать её ниже")
    ev = st.dataframe(
        df,
        width="stretch",
        hide_index=True,
        on_select="rerun",
        selection_mode="single-row",
        key="tut_table_sel",
        column_config={
            "Город": st.column_config.TextColumn("Город", width="small"),
            "Ставка": st.column_config.NumberColumn("Ставка", format="%d ₽", width="small"),
            "Рейтинг": st.column_config.TextColumn("Рейтинг", width="small"),
            "Статус": st.column_config.TextColumn("Статус", width="small"),
            "Выдача": st.column_config.TextColumn("Выдача", width="small"),
        },
    )
    st.download_button("⬇ Скачать анкеты (CSV)", data=csv_bytes(df_csv), file_name="vektor-tutors.csv", mime="text/csv")

    sel = filtered[selected_row_idx(ev, len(filtered))]
    is_ver = bool(sel.get("verified"))
    is_bumped = bool(sel.get("bumpedToday"))

    with st.container(border=True):
        c_info, c_act = st.columns([3, 2], gap="large")
        with c_info:
            st.markdown(f"#### {sel.get('fullName')}")
            st.caption(f"ID `{sel.get('id')}` · {sel.get('subject')} · {sel.get('city')} ({sel.get('timezone') or 'UTC+9'})")
            st.markdown(
                f"**{'✅ Проверен (синяя галочка)' if is_ver else '⏳ Ждёт проверки'}** · "
                f"**{'🚀 В топе сегодня' if is_bumped else 'Обычная выдача'}**"
            )
            st.markdown(
                f"- **Ставка анкеты:** {fmt_rub(sel.get('baseRateRub'))} (рынок {fmt_rub(sel.get('marketRateRub'))}) · "
                f"**Рейтинг:** ★ {float(sel.get('rating') or 0):.2f} ({int(sel.get('reviewsCount') or 0)} отзывов)\n"
                f"- **Источник:** {CHANNEL_LABELS.get(str(sel.get('sourceChannel')), str(sel.get('sourceChannel') or '—'))}\n"
                f"- **WhatsApp:** `{sel.get('whatsappPhone') or '—'}` · "
                f"**Telegram:** `{sel.get('telegramHandle') or '—'}` · **MAX:** `{sel.get('maxHandle') or '—'}`"
            )
        with c_act:
            st.markdown("**Модерация анкеты**")
            b1, b2 = st.columns(2)
            if b1.button(
                "Снять галочку" if is_ver else "✅ Одобрить",
                key=f"tut_ver_{sel['id']}",
                type="secondary" if is_ver else "primary",
                width="stretch",
            ):
                try:
                    client.moderate_tutor(sel["id"], verified=not is_ver)
                    _notify_done(f"Статус проверки {sel.get('fullName')} обновлён")
                except AdminApiError as exc:
                    st.error(exc.message)
            if b2.button(
                "Убрать из топа" if is_bumped else "🚀 В топ",
                key=f"tut_bmp_{sel['id']}",
                width="stretch",
            ):
                try:
                    client.moderate_tutor(sel["id"], bumped=not is_bumped)
                    _notify_done(f"Топ-статус {sel.get('fullName')} обновлён")
                except AdminApiError as exc:
                    st.error(exc.message)


def _render_tutor_verifications(
    client: AdminApiClient,
    verifications: list[dict[str, Any]],
    load_error: str | None = None,
) -> None:
    if load_error:
        st.error(f"Не удалось загрузить заявки на верификацию: {load_error}")
        return
    if not verifications:
        st.info("Заявок на проверку дипломов и сертификатов пока нет.")
        return

    status_pick = st.pills(
        "Статус заявки",
        ["all", "pending", "approved", "rejected"],
        default="all",
        format_func=lambda s: {
            "all": "Все",
            "pending": "На проверке ⏳",
            "approved": "Одобренные ✅",
            "rejected": "Отклонённые ❌",
        }[s],
        key="tut_verif_status_filter",
    ) or "all"

    filtered = [
        v for v in verifications
        if status_pick == "all" or str(v.get("status") or "pending") == status_pick
    ]
    if not filtered:
        st.info("Заявок с выбранным статусом нет.")
        return

    rows = []
    for v in filtered:
        dtype = str(v.get("docType") or v.get("doc_type") or "diploma")
        st_code = str(v.get("status") or "pending")
        raw_bytes = int(v.get("sizeBytes") or v.get("bytes") or 0)
        size_kb = round(raw_bytes / 1024.0, 1) if raw_bytes else 0.0
        rows.append(
            {
                "Преподаватель": v.get("tutorName") or v.get("tutor_name") or v.get("tutorId") or "—",
                "Тип документа": _VERIF_DOC_LABELS.get(dtype, dtype),
                "Название": v.get("title") or "—",
                "Статус": _VERIF_STATUS_BADGES.get(st_code, st_code),
                "Размер": f"{size_kb} КБ" if size_kb else "—",
                "Загружен": fmt_dt_short(v.get("createdAt") or v.get("created_at")),
            }
        )

    st.caption("Выберите заявку в таблице, чтобы посмотреть скан документа и выдать синюю галочку")
    ev = st.dataframe(
        pd.DataFrame(rows),
        width="stretch",
        hide_index=True,
        on_select="rerun",
        selection_mode="single-row",
        key="tut_verif_table_sel",
    )
    sel = filtered[selected_row_idx(ev, len(filtered))]
    vid = str(sel["id"])
    st_code = str(sel.get("status") or "pending")
    dtype = str(sel.get("docType") or sel.get("doc_type") or "diploma")

    with st.container(border=True):
        c_doc, c_act = st.columns([3, 2], gap="large")
        with c_doc:
            st.markdown(f"#### {sel.get('title') or _VERIF_DOC_LABELS.get(dtype, 'Документ')}")
            st.caption(
                f"Заявка `{vid}` · Преподаватель: {sel.get('tutorName') or sel.get('tutorId') or '—'} · "
                f"{_VERIF_STATUS_BADGES.get(st_code, st_code)}"
            )
            if sel.get("comment"):
                st.markdown(f"**Комментарий репетитора:** {sel.get('comment')}")
            try:
                file_bytes, mime = client.verification_file_bytes(vid)
                ext = "pdf" if mime == "application/pdf" else (mime.split("/")[-1] or "bin")
                if mime.startswith("image/"):
                    st.image(file_bytes, caption=f"{vid} ({mime})", width="stretch")
                else:
                    st.info(f"Файл формата `{mime}` ({round(len(file_bytes) / 1024.0, 1)} КБ). Скачайте для проверки.")
                st.download_button(
                    "⬇ Скачать оригинал документа",
                    data=file_bytes,
                    file_name=str(sel.get("originalFilename") or f"{vid}.{ext}"),
                    mime=mime,
                    key=f"verif_dl_{vid}",
                )
            except AdminApiError as exc:
                st.warning(f"Не удалось загрузить файл из хранилища: {exc.message}")

        with c_act:
            st.markdown("**Решение модератора**")
            note = st.text_area(
                "Комментарий проверки (при отказе обязателен)",
                value=str(sel.get("reviewNote") or sel.get("review_note") or ""),
                key=f"verif_note_{vid}",
                height=100,
            )
            b_ok, b_no = st.columns(2)
            if b_ok.button("✅ Одобрить и выдать галочку", key=f"verif_ok_{vid}", type="primary", width="stretch"):
                try:
                    res = client.review_verification(vid, "approve", note)
                    badge_msg = " и выдана синяя галочка" if res.get("verifiedGranted") else ""
                    _notify_done(f"Документ {vid} одобрен{badge_msg}")
                except AdminApiError as exc:
                    st.error(exc.message)
            if b_no.button("❌ Отклонить", key=f"verif_no_{vid}", width="stretch"):
                try:
                    client.review_verification(vid, "reject", note)
                    _notify_done(f"Заявка {vid} отклонена")
                except AdminApiError as exc:
                    st.error(exc.message)


_TUTOR_APP_STATUS_LABELS = {
    "new": "Новая 🆕",
    "contacted": "В работе 📞",
    "approved": "Одобрена ✅",
    "rejected": "Отклонена ❌",
}


def _render_tutor_applications(
    client: AdminApiClient,
    applications: list[dict[str, Any]],
    load_error: str | None = None,
) -> None:
    if load_error:
        st.error(f"Не удалось загрузить заявки с лендинга: {load_error}")
        return
    if not applications:
        st.info("Заявок преподавателей с лендинга пока нет.")
        return

    c1, c2 = st.columns([3, 2])
    st_pick = c1.pills(
        "Статус заявки",
        ["all", "new", "contacted", "approved", "rejected"],
        default="all",
        format_func=lambda s: "Все" if s == "all" else _TUTOR_APP_STATUS_LABELS.get(s, s),
        key="tapp_status_filter",
    ) or "all"
    search_q = c2.text_input("Поиск", placeholder="Имя, предмет, контакт или ID", key="tapp_search")

    filtered = [
        a for a in applications
        if (st_pick == "all" or str(a.get("status") or "new") == st_pick)
        and _match_query(a, search_q, ("id", "name", "subject", "subjectName", "contact", "reviewNote"))
    ]
    if not filtered:
        st.info("По выбранному фильтру заявок не найдено.")
        return

    rows = [
        {
            "Преподаватель": a.get("name") or "—",
            "Предмет": a.get("subjectName") or a.get("subject") or "—",
            "Ставка": int(a.get("rate") or 0),
            "Контакт": a.get("contact") or "—",
            "Статус": _TUTOR_APP_STATUS_LABELS.get(str(a.get("status") or "new"), str(a.get("status"))),
            "Создана": fmt_dt_short(a.get("createdAt")),
        }
        for a in filtered
    ]
    df = pd.DataFrame(rows)
    df_csv = pd.DataFrame(
        [
            {
                "ID": a.get("id"),
                **row,
                "Источник": a.get("source") or "landing",
                "Создана анкета": a.get("createdTutorId") or "",
                "Комментарий": a.get("reviewNote") or "",
            }
            for a, row in zip(filtered, rows)
        ]
    )

    st.caption("Выберите заявку с лендинга, чтобы связаться с преподавателем или опубликовать анкету в каталог")
    ev = st.dataframe(
        df,
        width="stretch",
        hide_index=True,
        on_select="rerun",
        selection_mode="single-row",
        key="tapp_table_sel",
        column_config={
            "Ставка": st.column_config.NumberColumn("Ставка", format="%d ₽", width="small"),
            "Статус": st.column_config.TextColumn("Статус", width="small"),
            "Создана": st.column_config.TextColumn("Создана", width="small"),
        },
    )
    st.download_button(
        "⬇ Скачать заявки (CSV)",
        data=csv_bytes(df_csv),
        file_name="vektor-tutor-applications.csv",
        mime="text/csv",
    )

    sel = filtered[selected_row_idx(ev, len(filtered))]
    aid = str(sel["id"])
    cur_st = str(sel.get("status") or "new")
    rate_val = int(sel.get("rate") or 0)
    pro_tag = " · `Выше рынка · Профи`" if rate_val >= 1400 else ""

    with st.container(border=True):
        c_info, c_act = st.columns([3, 2], gap="large")
        with c_info:
            st.markdown(f"#### {sel.get('name') or 'Без имени'} · {fmt_rub(rate_val)}/ч")
            st.markdown(f"**{_TUTOR_APP_STATUS_LABELS.get(cur_st, cur_st)}**{pro_tag}")
            st.markdown(
                f"- **ID заявки:** `{aid}` · **Источник:** `{sel.get('source') or 'landing'}`\n"
                f"- **Предмет:** {sel.get('subjectName') or sel.get('subject') or '—'}\n"
                f"- **Контакт:** `{sel.get('contact') or '—'}`\n"
                f"- **Анкета в каталоге:** `{sel.get('createdTutorId') or 'не создана'}`\n"
                f"- **Создана:** {fmt_dt(sel.get('createdAt'))} · **Рассмотрена:** {fmt_dt(sel.get('reviewedAt'))}"
            )
        with c_act:
            st.markdown("**Модерация заявки с лендинга**")
            note = st.text_area(
                "Комментарий модератора",
                value=str(sel.get("reviewNote") or ""),
                key=f"tapp_note_{aid}",
                height=90,
            )
            if st.button(
                "✅ Одобрить и в каталог",
                key=f"tapp_pub_{aid}",
                type="primary",
                disabled=cur_st == "approved" and bool(sel.get("createdTutorId")),
                width="stretch",
            ):
                try:
                    res = client.review_tutor_application(aid, "approved", note, publish_to_catalog=True)
                    tid = (res.get("tutor") or {}).get("id") or (res.get("application") or {}).get("createdTutorId") or ""
                    extra = f" · анкета {tid} добавлена в каталог" if tid else ""
                    _notify_done(f"Заявка {aid} одобрена{extra}")
                except AdminApiError as exc:
                    st.error(exc.message)
            b1, b2 = st.columns(2)
            if b1.button("📞 В работе", key=f"tapp_cnt_{aid}", disabled=cur_st == "contacted", width="stretch"):
                try:
                    client.review_tutor_application(aid, "contacted", note)
                    _notify_done(f"Заявка {aid} переведена в работу")
                except AdminApiError as exc:
                    st.error(exc.message)
            if b2.button("❌ Отклонить", key=f"tapp_rej_{aid}", disabled=cur_st == "rejected", width="stretch"):
                try:
                    client.review_tutor_application(aid, "rejected", note)
                    _notify_done(f"Заявка {aid} отклонена")
                except AdminApiError as exc:
                    st.error(exc.message)


def _render_tutors(client: AdminApiClient) -> None:
    st.title("Модерация анкет репетиторов")
    tutors = client.tutors(limit=300)
    verif_err: str | None = None
    verifications: list[dict[str, Any]] = []
    try:
        verifications = client.verifications(limit=300)
    except AdminApiError as exc:
        verif_err = exc.message

    apps_err: str | None = None
    applications: list[dict[str, Any]] = []
    try:
        applications = client.tutor_applications(limit=300)
    except AdminApiError as exc:
        apps_err = exc.message

    ver_cnt = sum(1 for t in tutors if t.get("verified"))
    unver_cnt = len(tutors) - ver_cnt
    pending_v_cnt = sum(1 for v in verifications if str(v.get("status") or "pending") == "pending")
    new_apps_cnt = sum(1 for a in applications if str(a.get("status") or "new") == "new")

    m1, m2, m3, m4 = st.columns(4)
    m1.container(border=True).metric("Всего анкет", len(tutors))
    m2.container(border=True).metric("Проверенные ✅", ver_cnt)
    m3.container(border=True).metric("На проверке ⏳", unver_cnt)
    m4.container(border=True).metric("Заявки с лендинга 🆕", new_apps_cnt)

    tab_catalog, tab_apps, tab_verif = st.tabs([
        "📋 Каталог и модерация",
        f"📥 Заявки с лендинга ({new_apps_cnt})",
        f"🎓 Проверка дипломов ({pending_v_cnt})",
    ])
    with tab_catalog:
        _render_tutor_catalog(client, tutors)
    with tab_apps:
        _render_tutor_applications(client, applications, apps_err)
    with tab_verif:
        _render_tutor_verifications(client, verifications, verif_err)


# ---------- Раздел 5: Выплаты НПД и пополнения ЮKassa ----------

_PAYMENT_STATUS_BADGES = {
    "pending": "⏳ Ожидает",
    "waiting_for_capture": "🟠 Холд",
    "succeeded": "✅ Зачислен",
    "canceled": "❌ Отменён",
}

_REFUND_STATUS_BADGES = {
    "requested": "🆕 Заявка",
    "pending": "⏳ В банке",
    "succeeded": "✅ Возвращён",
    "canceled": "❌ Отменён банком",
    "rejected": "✖ Отклонён",
}


_NPD_SHORT_LABELS = {
    "registered": "✅ ФНС",
    "demo": "🧪 Демо",
    "pending": "⏳ Ожидает",
    "failed": "❌ Ошибка",
    "canceled": "✖ Аннулирован",
    "none": "—",
}


def _render_payouts_tab(client: AdminApiClient) -> None:
    payouts = client.payouts(limit=300)
    if not payouts:
        st.info("Заявок на вывод средств пока нет.")
        return

    proc_items = [p for p in payouts if p.get("status") in ("processing", "pending")]
    ok_items = [p for p in payouts if p.get("status") in ("succeeded", "paid")]
    rej_items = [p for p in payouts if p.get("status") in ("rejected", "failed")]
    npd_cnt = sum(1 for p in payouts if p.get("npdReceipt"))

    m1, m2, m3, m4 = st.columns(4)
    m1.container(border=True).metric(f"К выплате ({len(proc_items)})", fmt_rub(sum(int(p.get("amountRub") or 0) for p in proc_items)))
    m2.container(border=True).metric(f"Выплачено ({len(ok_items)})", fmt_rub(sum(int(p.get("amountRub") or 0) for p in ok_items)))
    m3.container(border=True).metric(f"Отклонено ({len(rej_items)})", fmt_rub(sum(int(p.get("amountRub") or 0) for p in rej_items)))
    m4.container(border=True).metric("С чеком НПД", f"{npd_cnt} из {len(payouts)}")

    c1, c2 = st.columns([3, 2])
    st_pick = c1.pills(
        "Статус выплаты",
        ["all", "processing", "succeeded", "rejected"],
        default="all",
        format_func=lambda s: "Все" if s == "all" else PAYOUT_STATUS_LABELS.get(s, s),
        key="pay_status_filter",
    ) or "all"
    search_q = c2.text_input("Поиск", placeholder="ID, репетитор, ИНН, банк, реквизиты или чек НПД", key="pay_search")

    filtered = [
        p for p in payouts
        if (st_pick == "all" or p.get("status") == st_pick)
        and _match_query(p, search_q, ("id", "tutorName", "tutorInn", "bank", "destinationMasked", "npdReceipt", "providerPayoutId"))
    ]

    if not filtered:
        st.info("По выбранному фильтру выплат не найдено.")
        return

    rows = [
        {
            "Преподаватель": p.get("tutorName") or "—",
            "Сумма": int(p.get("amountRub") or 0),
            "Банк / способ": f"{p.get('bank') or '—'} · {METHOD_LABELS.get(str(p.get('method')), str(p.get('method') or '—'))}",
            "Провайдер": "ЮKassa" if p.get("provider") == "yookassa" else "Ручной",
            "Чек НПД": f"{_NPD_SHORT_LABELS.get(str(p.get('npdStatus') or 'none'), '—')}{' · 🛡 Холд' if p.get('antifraudHold') else ''}",
            "Статус": _SHORT_PAYOUT_STATUS.get(str(p.get("status")), str(p.get("status"))),
            "Создана": fmt_dt_short(p.get("createdAt")),
        }
        for p in filtered
    ]
    df = pd.DataFrame(rows)
    df_csv = pd.DataFrame(
        [
            {
                "ID": p.get("id"),
                **row,
                "ИНН": p.get("tutorInn") or "—",
                "Код чека НПД": p.get("npdReceipt") or "—",
                "Ссылка чека ФНС": p.get("npdReceiptUrl") or "",
                "ID ЮKassa": p.get("providerPayoutId") or "",
            }
            for p, row in zip(filtered, rows)
        ]
    )

    st.caption("Нажмите на выплату в таблице, чтобы отправить перевод в ЮKassa или зарегистрировать чек НПД")
    ev = st.dataframe(
        df,
        width="stretch",
        hide_index=True,
        on_select="rerun",
        selection_mode="single-row",
        key="pay_table_sel",
        column_config={
            "Сумма": st.column_config.NumberColumn("Сумма", format="%d ₽", width="small"),
            "Провайдер": st.column_config.TextColumn("Провайдер", width="small"),
            "Чек НПД": st.column_config.TextColumn("Чек НПД", width="small"),
            "Статус": st.column_config.TextColumn("Статус", width="small"),
            "Создана": st.column_config.TextColumn("Создана", width="small"),
        },
    )
    st.download_button("⬇ Скачать выплаты (CSV)", data=csv_bytes(df_csv), file_name="vektor-payouts.csv", mime="text/csv")

    sel = filtered[selected_row_idx(ev, len(filtered))]
    cur_st = str(sel.get("status") or "processing")
    npd_url = str(sel.get("npdReceiptUrl") or "").strip()
    npd_st = str(sel.get("npdStatus") or "none").strip().lower()

    with st.container(border=True):
        c_info, c_act = st.columns([3, 2], gap="large")
        with c_info:
            st.markdown(f"#### Выплата `{sel.get('id')}` · {fmt_rub(sel.get('amountRub'))}")
            st.markdown(f"**{PAYOUT_STATUS_BADGES.get(cur_st, cur_st)}**")
            if sel.get("antifraudHold"):
                st.warning(f"🛡 Антифрод-холд: {sel.get('antifraudReason') or 'требуется ручная отправка'}")
            if sel.get("errorMessage"):
                st.error(f"Сообщение шлюза: {sel.get('errorMessage')}")
            npd_link_part = f" ([ФНС ↗]({npd_url}))" if npd_url.startswith("https://") else ""
            st.markdown(
                f"- **Преподаватель:** {sel.get('tutorName') or '—'} (ИНН: `{sel.get('tutorInn') or 'не указан'}`)\n"
                f"- **Банк и способ:** {sel.get('bank') or '—'} · {METHOD_LABELS.get(str(sel.get('method')), str(sel.get('method')))}"
                f"{(' · `bank_id ' + str(sel.get('sbpBankId')) + '`') if sel.get('sbpBankId') else ''}\n"
                f"- **Реквизиты:** `{sel.get('destinationMasked') or '—'}` · **Провайдер:** `{sel.get('provider') or 'manual'}`"
                f"{(' (`' + str(sel.get('providerPayoutId')) + '`, `' + str(sel.get('providerStatus') or '') + '`)') if sel.get('providerPayoutId') else ''}\n"
                f"- **Чек НПД:** `{sel.get('npdReceipt') or 'не сформирован'}` (`{_NPD_SHORT_LABELS.get(npd_st, npd_st)}`){npd_link_part}\n"
                f"- **Создана:** {fmt_dt(sel.get('createdAt'))} · **Оплачена:** {fmt_dt(sel.get('paidAt'))}"
            )
        with c_act:
            st.markdown("**Шлюз ЮKassa B2C и модерация**")
            d1, d2 = st.columns(2)
            if d1.button(
                "🚀 В ЮKassa",
                key=f"pay_disp_{sel['id']}",
                disabled=cur_st in ("succeeded", "paid") or bool(sel.get("providerPayoutId")),
                width="stretch",
            ):
                try:
                    client.dispatch_payout(sel["id"])
                    _notify_done(f"Выплата {sel['id']} отправлена в ЮKassa")
                except AdminApiError as exc:
                    st.error(exc.message)
            if d2.button(
                "🔄 Сверить",
                key=f"pay_sync_{sel['id']}",
                disabled=not bool(sel.get("providerPayoutId")),
                width="stretch",
            ):
                try:
                    sync_res = client.sync_payout(sel["id"])
                    st_after = (sync_res.get("payout") or {}).get("status") or cur_st
                    _notify_done(f"Статус выплаты {sel['id']}: {PAYOUT_STATUS_LABELS.get(st_after, st_after)}")
                except AdminApiError as exc:
                    st.error(exc.message)

            if sel.get("method") == "card" and cur_st not in ("succeeded", "paid") and not sel.get("providerPayoutId"):
                with st.expander("Реквизиты карты / payout_token", expanded=False):
                    manual_card = st.text_input("Номер карты или payout_token", key=f"pay_card_inp_{sel['id']}")
                    if st.button("Отправить по карте в ЮKassa", key=f"pay_card_send_{sel['id']}", width="stretch"):
                        try:
                            val = manual_card.strip()
                            is_digits = val.replace(" ", "").isdigit()
                            client.dispatch_payout(
                                sel["id"],
                                card_number=val if is_digits else "",
                                payout_token="" if is_digits else val,
                            )
                            _notify_done(f"Карточная выплата {sel['id']} отправлена в ЮKassa")
                        except AdminApiError as exc:
                            st.error(exc.message)

            b1, b2 = st.columns(2)
            if b1.button("✅ Выплачено", key=f"pay_ok_{sel['id']}", type="primary", disabled=cur_st in ("succeeded", "paid"), width="stretch"):
                _dialog_pay_payout(client, sel)
            if b2.button("❌ Отклонить", key=f"pay_rej_{sel['id']}", disabled=cur_st == "rejected", width="stretch"):
                try:
                    client.set_payout_status(sel["id"], "rejected")
                    _notify_done(f"Выплата {sel['id']} отклонена")
                except AdminApiError as exc:
                    st.error(exc.message)
            if cur_st != "processing" and st.button("↩️ Вернуть в обработку", key=f"pay_proc_{sel['id']}", width="stretch"):
                try:
                    client.set_payout_status(sel["id"], "processing")
                    _notify_done(f"Выплата {sel['id']} возвращена в обработку")
                except AdminApiError as exc:
                    st.error(exc.message)

            st.markdown("**Чеки НПД («Мой налог»)**")
            n1, n2 = st.columns(2)
            if n1.button("🧾 Выдать чек", key=f"pay_npd_reg_{sel['id']}", width="stretch"):
                try:
                    client.register_payout_npd(sel["id"])
                    _notify_done(f"Чек НПД по выплате {sel['id']} сформирован")
                except AdminApiError as exc:
                    st.error(exc.message)
            if n2.button("✖ Аннулировать", key=f"pay_npd_canc_{sel['id']}", disabled=not bool(sel.get("npdReceipt")), width="stretch"):
                try:
                    client.cancel_payout_npd(sel["id"])
                    _notify_done(f"Чек НПД по выплате {sel['id']} аннулирован")
                except AdminApiError as exc:
                    st.error(exc.message)
            with st.expander("ИНН или ссылка чека ФНС", expanded=False):
                inn_inp = st.text_input("ИНН (12 цифр)", value=str(sel.get("tutorInn") or ""), key=f"pay_inn_inp_{sel['id']}")
                url_inp = st.text_input("Ссылка ФНС (lknpd.nalog.ru/.../print)", value=npd_url, key=f"pay_url_inp_{sel['id']}")
                if st.button("Сохранить чек НПД", key=f"pay_npd_save_{sel['id']}", width="stretch"):
                    try:
                        client.register_payout_npd(sel["id"], tutor_inn=inn_inp, receipt_url=url_inp)
                        _notify_done(f"Чек НПД обновлён для {sel['id']}")
                    except AdminApiError as exc:
                        st.error(exc.message)


def _render_payments_tab(client: AdminApiClient, payments: list[dict[str, Any]], load_error: str | None = None) -> None:
    if load_error:
        st.error(f"Не удалось загрузить платежи: {load_error}")
        return
    if not payments:
        st.info("Платёжных сессий ЮKassa пока нет.")
        return

    ok_items = [p for p in payments if p.get("status") == "succeeded"]
    pend_items = [p for p in payments if p.get("status") in ("pending", "waiting_for_capture")]
    canc_items = [p for p in payments if p.get("status") == "canceled"]

    m1, m2, m3, m4 = st.columns(4)
    m1.container(border=True).metric("Всего платежей", len(payments))
    m2.container(border=True).metric("Зачислено ✅", fmt_rub(sum(int(p.get("amountRub") or 0) for p in ok_items)))
    m3.container(border=True).metric("Ожидает ⏳", f"{len(pend_items)} ({fmt_rub(sum(int(p.get('amountRub') or 0) for p in pend_items))})")
    m4.container(border=True).metric("Отменено ❌", len(canc_items))

    c1, c2 = st.columns([3, 2])
    st_pick = c1.pills(
        "Статус платежа",
        ["all", "pending", "succeeded", "canceled"],
        default="all",
        format_func=lambda s: "Все" if s == "all" else _PAYMENT_STATUS_BADGES.get(s, s),
        key="yk_pay_status_filter",
    ) or "all"
    search_q = c2.text_input("Поиск", placeholder="ID сессии, ЮKassa ID, логин или email чека", key="yk_pay_search")

    filtered = [
        p for p in payments
        if (st_pick == "all" or p.get("status") == st_pick)
        and _match_query(p, search_q, ("id", "providerPaymentId", "username", "userDisplayName", "receiptEmail"))
    ]
    if not filtered:
        st.info("Платежей с выбранным фильтром не найдено.")
        return

    rows = [
        {
            "ID": p.get("id") or "—",
            "Ученик": p.get("userDisplayName") or p.get("username") or p.get("userId") or "—",
            "Метод": METHOD_LABELS.get(str(p.get("method")), str(p.get("method") or "—")),
            "На баланс": int(p.get("amountRub") or 0),
            "Комиссия": int(p.get("feeRub") or 0),
            "Статус": _PAYMENT_STATUS_BADGES.get(str(p.get("status")), str(p.get("status") or "—")),
            "ЮKassa ID": p.get("providerPaymentId") or "—",
            "Создан": fmt_dt_short(p.get("createdAt")),
        }
        for p in filtered
    ]
    ev = st.dataframe(
        pd.DataFrame(rows),
        width="stretch",
        hide_index=True,
        on_select="rerun",
        selection_mode="single-row",
        key="yk_pay_table_sel",
        column_config={
            "На баланс": st.column_config.NumberColumn("На баланс", format="%d ₽", width="small"),
            "Комиссия": st.column_config.NumberColumn("Комиссия", format="%d ₽", width="small"),
            "Статус": st.column_config.TextColumn("Статус", width="small"),
        },
    )
    sel = filtered[selected_row_idx(ev, len(filtered))]
    pid = str(sel["id"])
    with st.container(border=True):
        ci, ca = st.columns([3, 2], gap="large")
        with ci:
            st.markdown(f"#### Сессия `{pid}` · {fmt_rub(sel.get('amountRub'))}")
            refunded_rub = int(sel.get("refundedRub") or 0)
            refundable_rub = int(sel.get("refundableRub") or 0)
            st.markdown(
                f"- **Статус:** {_PAYMENT_STATUS_BADGES.get(str(sel.get('status')), str(sel.get('status')))} "
                f"({'зачислен на баланс' if sel.get('credited') else 'не зачислен'})\n"
                f"- **ЮKassa ID:** `{sel.get('providerPaymentId') or '—'}` · **Итого списано:** {fmt_rub(sel.get('totalRub'))}\n"
                f"- **Возвращено:** {fmt_rub(refunded_rub)} · **Доступно к возврату:** {fmt_rub(refundable_rub)}\n"
                f"- **Чек 54-ФЗ:** email `{sel.get('receiptEmail') or '—'}` · тел `{sel.get('receiptPhone') or '—'}`\n"
                f"- **Создан:** {fmt_dt(sel.get('createdAt'))} · **Оплачен:** {fmt_dt(sel.get('paidAt'))}"
            )
            if sel.get("errorMessage"):
                st.warning(f"Примечание: {sel.get('errorMessage')}")
        with ca:
            st.markdown("**Сверка статуса с ЮKassa API**")
            if st.button("🔄 Сверить с ЮKassa", key=f"yk_sync_{pid}", type="primary", width="stretch"):
                try:
                    res = client.sync_payment(pid)
                    note_credited = " — баланс зачислен" if res.get("creditedNow") else ""
                    _notify_done(f"Статус {pid}: {(res.get('intent') or {}).get('status')}{note_credited}")
                except AdminApiError as exc:
                    st.error(exc.message)

            if sel.get("status") == "succeeded" and sel.get("credited") and refundable_rub > 0:
                st.divider()
                st.markdown("**↩️ Банковский возврат остатка (`POST /v3/refunds`)**")
                ref_amt = st.number_input(
                    "Сумма возврата (₽)",
                    min_value=1,
                    max_value=refundable_rub,
                    value=refundable_rub,
                    step=50,
                    key=f"yk_dir_ref_amt_{pid}",
                )
                ref_reason = st.text_input(
                    "Причина возврата",
                    placeholder="Возврат неиспользованного остатка баланса",
                    key=f"yk_dir_ref_rsn_{pid}",
                )
                if st.button("↩️ Вернуть через ЮKassa", key=f"yk_dir_ref_btn_{pid}", width="stretch"):
                    _dialog_yookassa_refund(
                        client,
                        mode="payment",
                        target_id=pid,
                        amount_rub=int(ref_amt),
                        user_label=str(sel.get("userDisplayName") or sel.get("username") or sel.get("userId")),
                        reason=ref_reason,
                    )


def _render_refunds_tab(client: AdminApiClient, refunds: list[dict[str, Any]], load_error: str | None = None) -> None:
    if load_error:
        st.error(f"Не удалось загрузить возвраты ЮKassa: {load_error}")
        return
    if not refunds:
        st.info("Заявок на банковский возврат остатка кошелька пока нет.")
        return

    active_items = [r for r in refunds if r.get("status") in ("requested", "pending")]
    done_items = [r for r in refunds if r.get("status") == "succeeded"]
    closed_items = [r for r in refunds if r.get("status") in ("canceled", "rejected")]

    m1, m2, m3, m4 = st.columns(4)
    m1.container(border=True).metric("Всего возвратов", len(refunds))
    m2.container(border=True).metric("В очереди ⏳", f"{len(active_items)} ({fmt_rub(sum(int(r.get('amountRub') or 0) for r in active_items))})")
    m3.container(border=True).metric("Возвращено ✅", fmt_rub(sum(int(r.get("amountRub") or 0) for r in done_items)))
    m4.container(border=True).metric("Отменено / отклонено", len(closed_items))

    c1, c2 = st.columns([3, 2])
    st_pick = c1.pills(
        "Статус возврата",
        ["all", "requested", "pending", "succeeded", "canceled", "rejected"],
        default="all",
        format_func=lambda s: "Все" if s == "all" else _REFUND_STATUS_BADGES.get(s, s),
        key="yk_ref_status_filter",
    ) or "all"
    search_q = c2.text_input("Поиск", placeholder="ID возврата, платежа, ЮKassa ID, логин", key="yk_ref_search")

    filtered = [
        r for r in refunds
        if (st_pick == "all" or r.get("status") == st_pick)
        and _match_query(r, search_q, ("id", "paymentIntentId", "providerRefundId", "providerPaymentId", "username", "userDisplayName", "reason"))
    ]
    if not filtered:
        st.info("Возвратов с выбранным фильтром не найдено.")
        return

    rows = [
        {
            "ID": r.get("id") or "—",
            "Ученик": r.get("userDisplayName") or r.get("username") or r.get("userId") or "—",
            "Сумма": int(r.get("amountRub") or 0),
            "Способ": METHOD_LABELS.get(str(r.get("method")), str(r.get("method") or "—")),
            "Статус": _REFUND_STATUS_BADGES.get(str(r.get("status")), str(r.get("status") or "—")),
            "ЮKassa Refund": r.get("providerRefundId") or "—",
            "Создан": fmt_dt_short(r.get("createdAt")),
        }
        for r in filtered
    ]
    df = pd.DataFrame(rows)
    ev = st.dataframe(
        df,
        width="stretch",
        hide_index=True,
        on_select="rerun",
        selection_mode="single-row",
        key="yk_ref_table_sel",
        column_config={
            "Сумма": st.column_config.NumberColumn("Сумма", format="%d ₽", width="small"),
            "Статус": st.column_config.TextColumn("Статус", width="small"),
            "Создан": st.column_config.TextColumn("Создан", width="small"),
        },
    )
    st.download_button(
        "⬇ Скачать возвраты (CSV)",
        data=csv_bytes(df),
        file_name="vektor-yookassa-refunds.csv",
        mime="text/csv",
    )

    sel = filtered[selected_row_idx(ev, len(filtered))]
    rid = str(sel["id"])
    cur_st = str(sel.get("status") or "requested")
    amt = int(sel.get("amountRub") or 0)
    with st.container(border=True):
        ci, ca = st.columns([3, 2], gap="large")
        with ci:
            st.markdown(f"#### Возврат `{rid}` · {fmt_rub(amt)}")
            st.markdown(
                f"- **Ученик:** {sel.get('userDisplayName') or sel.get('username') or sel.get('userId')}\n"
                f"- **Статус:** {_REFUND_STATUS_BADGES.get(cur_st, cur_st)} "
                f"{'· остаток возвращён в кошелёк' if sel.get('balanceReverted') else ''}\n"
                f"- **Исходный платёж:** `{sel.get('paymentIntentId') or 'demo'}` · **ЮKassa Payment:** `{sel.get('providerPaymentId') or '—'}`\n"
                f"- **ЮKassa Refund ID:** `{sel.get('providerRefundId') or 'не создан'}` · **Провайдер:** `{sel.get('provider')}`\n"
                f"- **Чек 54-ФЗ:** email `{sel.get('receiptEmail') or '—'}` · тел `{sel.get('receiptPhone') or '—'}`\n"
                f"- **Причина:** {sel.get('reason') or 'не указана'}\n"
                f"- **Создан:** {fmt_dt(sel.get('createdAt'))} · **Исполнен:** {fmt_dt(sel.get('refundedAt'))}"
            )
            if sel.get("reviewNote"):
                st.info(f"Комментарий админа: {sel.get('reviewNote')}")
            if sel.get("errorMessage"):
                st.warning(f"Ответ провайдера: {sel.get('errorMessage')}")

        with ca:
            st.markdown("**Управление возвратом ЮKassa**")
            note = st.text_area(
                "Комментарий модератора",
                value=str(sel.get("reviewNote") or ""),
                key=f"yk_ref_note_{rid}",
                height=90,
            )
            if cur_st == "requested":
                if st.button("💸 Провести возврат в ЮKassa", key=f"yk_ref_disp_{rid}", type="primary", width="stretch"):
                    _dialog_yookassa_refund(
                        client,
                        mode="refund",
                        target_id=rid,
                        amount_rub=amt,
                        user_label=str(sel.get("userDisplayName") or sel.get("username") or sel.get("userId")),
                        reason=note or str(sel.get("reason") or ""),
                    )
                if st.button("✖ Отклонить и вернуть на баланс", key=f"yk_ref_rej_{rid}", width="stretch"):
                    try:
                        client.reject_refund(rid, review_note=note or "Отклонено администратором")
                        _notify_done(f"Возврат {rid} отклонён, {fmt_rub(amt)} возвращено на баланс")
                    except AdminApiError as exc:
                        st.error(exc.message)
            elif cur_st == "pending":
                if st.button("🔄 Сверить статус с ЮKassa", key=f"yk_ref_sync_{rid}", type="primary", width="stretch"):
                    try:
                        res = client.sync_refund(rid)
                        new_st = (res.get("refund") or {}).get("status") or cur_st
                        _notify_done(f"Статус возврата {rid}: {new_st}")
                    except AdminApiError as exc:
                        st.error(exc.message)
            else:
                st.caption(f"Возврат завершён в статусе: `{cur_st}`")


def _render_payouts(client: AdminApiClient) -> None:
    st.title("Выплаты преподавателям, пополнения и возвраты ЮKassa")
    pay_err: str | None = None
    payments: list[dict[str, Any]] = []
    try:
        payments = client.payments(limit=300)
    except AdminApiError as exc:
        pay_err = exc.message
    ref_err: str | None = None
    refunds: list[dict[str, Any]] = []
    try:
        refunds = client.refunds(limit=300)
    except AdminApiError as exc:
        ref_err = exc.message
    pend_cnt = sum(1 for p in payments if p.get("status") in ("pending", "waiting_for_capture"))
    pend_ref_cnt = sum(1 for r in refunds if r.get("status") in ("requested", "pending"))
    tab_out, tab_in, tab_ref = st.tabs([
        "💸 Выплаты НПД",
        f"💳 Пополнения ЮKassa ({pend_cnt})",
        f"↩️ Возвраты ЮKassa ({pend_ref_cnt})",
    ])
    with tab_out:
        _render_payouts_tab(client)
    with tab_in:
        _render_payments_tab(client, payments, pay_err)
    with tab_ref:
        _render_refunds_tab(client, refunds, ref_err)


# ---------- Раздел 5: Обратная связь (баги и сотрудничество) ----------

_FEEDBACK_KIND_LABELS = {
    "bug": "Баг 🐞",
    "cooperation": "Сотрудничество 🤝",
}
_FEEDBACK_STATUS_LABELS = {
    "new": "Новое 🆕",
    "in_progress": "В работе 🛠",
    "resolved": "Решено ✅",
    "closed": "Закрыто ✖",
}


def _fmt_bytes(size_bytes: int) -> str:
    n = max(0, int(size_bytes or 0))
    if n >= 1024 * 1024:
        return f"{n / (1024 * 1024):.1f} МБ"
    if n >= 1024:
        return f"{max(1, round(n / 1024))} КБ"
    return f"{n} Б"


def _render_feedback(client: AdminApiClient) -> None:
    st.title("Обратная связь и баг-репорты")
    tickets = client.feedback(limit=300)

    total_cnt = len(tickets)
    new_cnt = sum(1 for t in tickets if str(t.get("status") or "new") == "new")
    bug_cnt = sum(1 for t in tickets if str(t.get("kind") or "bug") == "bug")
    coop_cnt = sum(1 for t in tickets if str(t.get("kind") or "bug") == "cooperation")

    m1, m2, m3, m4 = st.columns(4)
    m1.container(border=True).metric("Всего обращений", total_cnt)
    m2.container(border=True).metric("Новые 🆕", new_cnt)
    m3.container(border=True).metric("Баги 🐞", bug_cnt)
    m4.container(border=True).metric("Сотрудничество 🤝", coop_cnt)

    if not tickets:
        st.info("Обращений и баг-репортов пока нет.")
        return

    c1, c2, c3 = st.columns([2, 3, 2])
    kind_pick = c1.pills(
        "Тип",
        ["all", "bug", "cooperation"],
        default="all",
        format_func=lambda k: "Все" if k == "all" else _FEEDBACK_KIND_LABELS.get(k, k),
        key="fb_kind_filter",
    ) or "all"
    st_pick = c2.pills(
        "Статус",
        ["all", "new", "in_progress", "resolved", "closed"],
        default="all",
        format_func=lambda s: "Все" if s == "all" else _FEEDBACK_STATUS_LABELS.get(s, s),
        key="fb_status_filter",
    ) or "all"
    search_q = c3.text_input("Поиск", placeholder="ID, тема, текст, контакт, автор", key="fb_search")

    filtered = [
        t for t in tickets
        if (kind_pick == "all" or str(t.get("kind") or "bug") == kind_pick)
        and (st_pick == "all" or str(t.get("status") or "new") == st_pick)
        and _match_query(t, search_q, ("id", "subject", "message", "contact", "authorName", "pageUrl"))
    ]
    if not filtered:
        st.info("По выбранному фильтру обращений не найдено.")
        return

    rows = [
        {
            "ID": str(t.get("id") or ""),
            "Тип": _FEEDBACK_KIND_LABELS.get(str(t.get("kind") or "bug"), str(t.get("kind"))),
            "Статус": _FEEDBACK_STATUS_LABELS.get(str(t.get("status") or "new"), str(t.get("status"))),
            "Тема": str(t.get("subject") or "—")[:80],
            "Контакт": str(t.get("contact") or t.get("authorName") or "—"),
            "Файлы": f"📎 {int(t.get('attachmentsCount') or 0)}" if int(t.get("attachmentsCount") or 0) > 0 else "—",
            "Создано": fmt_dt_short(t.get("createdAt")),
        }
        for t in filtered
    ]
    df = pd.DataFrame(rows)
    df_csv = pd.DataFrame(
        [
            {
                **row,
                "Автор": t.get("authorName") or "",
                "Сообщение": t.get("message") or "",
                "Страница": t.get("pageUrl") or "",
                "Заметка": t.get("reviewNote") or "",
            }
            for t, row in zip(filtered, rows)
        ]
    )

    ev = st.dataframe(
        df,
        width="stretch",
        hide_index=True,
        on_select="rerun",
        selection_mode="single-row",
        key="fb_table_sel",
        column_config={
            "ID": st.column_config.TextColumn("ID", width="small"),
            "Тип": st.column_config.TextColumn("Тип", width="small"),
            "Статус": st.column_config.TextColumn("Статус", width="small"),
            "Файлы": st.column_config.TextColumn("Файлы", width="small"),
            "Создано": st.column_config.TextColumn("Создано", width="small"),
        },
    )
    st.download_button(
        "⬇ Скачать обращения (CSV)",
        data=csv_bytes(df_csv),
        file_name="vektor-feedback.csv",
        mime="text/csv",
    )

    sel = filtered[selected_row_idx(ev, len(filtered))]
    tid = str(sel["id"])
    cur_kind = str(sel.get("kind") or "bug")
    cur_st = str(sel.get("status") or "new")
    attachments = list(sel.get("attachments") or [])

    with st.container(border=True):
        c_info, c_act = st.columns([3, 2], gap="large")
        with c_info:
            st.markdown(f"#### {_FEEDBACK_KIND_LABELS.get(cur_kind, cur_kind)} · {sel.get('subject') or 'Без темы'}")
            st.caption(
                f"Тикет `{tid}` · {_FEEDBACK_STATUS_LABELS.get(cur_st, cur_st)} · "
                f"Создан: {fmt_dt(sel.get('createdAt'))}"
            )
            st.markdown(
                f"- **Отправитель:** `{sel.get('authorName') or 'Гость'}` · "
                f"**Контакт:** `{sel.get('contact') or 'не указан'}`\n"
                f"- **Страница:** `{sel.get('pageUrl') or '—'}`"
            )
            st.markdown("**Текст обращения:**")
            st.text_area(
                "Текст обращения",
                value=str(sel.get("message") or ""),
                key=f"fb_body_view_{tid}",
                height=160,
                disabled=True,
                label_visibility="collapsed",
            )
            if sel.get("context"):
                with st.expander("Контекст клиента (экран / задание / раздел)"):
                    st.json(sel.get("context") or {})

            if attachments:
                st.markdown(f"**📎 Вложения ({len(attachments)})**")
                att_cols = st.columns(min(2, len(attachments)))
                for idx, att in enumerate(attachments):
                    aid = str(att.get("assetId") or "")
                    fname = str(att.get("originalFilename") or f"{aid}.bin")
                    fsize = _fmt_bytes(int(att.get("sizeBytes") or 0))
                    col = att_cols[idx % len(att_cols)]
                    with col.container(border=True):
                        try:
                            raw_bytes, mime = client.feedback_file_bytes(tid, aid)
                            if mime.startswith("image/"):
                                st.image(raw_bytes, caption=f"{fname} ({fsize})", width="stretch")
                            else:
                                st.markdown(f"📄 **{fname}**\n\n`{mime}` · {fsize}")
                            st.download_button(
                                f"⬇ Скачать {fname}",
                                data=raw_bytes,
                                file_name=fname,
                                mime=mime,
                                key=f"fb_dl_{tid}_{aid}",
                                width="stretch",
                            )
                        except AdminApiError as exc:
                            st.warning(f"Не удалось загрузить вложение `{fname}`: {exc.message}")

        with c_act:
            st.markdown("**Обработка обращения**")
            note = st.text_area(
                "Заметка администратора",
                value=str(sel.get("reviewNote") or ""),
                key=f"fb_note_{tid}",
                height=110,
            )
            if st.button("✅ Отметить решённым", key=f"fb_res_{tid}", type="primary", disabled=cur_st == "resolved", width="stretch"):
                try:
                    client.review_feedback(tid, "resolved", note)
                    _notify_done(f"Тикет {tid} отмечен решённым")
                except AdminApiError as exc:
                    st.error(exc.message)
            b1, b2 = st.columns(2)
            if b1.button("🛠 В работу", key=f"fb_prog_{tid}", disabled=cur_st == "in_progress", width="stretch"):
                try:
                    client.review_feedback(tid, "in_progress", note)
                    _notify_done(f"Тикет {tid} взят в работу")
                except AdminApiError as exc:
                    st.error(exc.message)
            if b2.button("✖ Закрыть", key=f"fb_cls_{tid}", disabled=cur_st == "closed", width="stretch"):
                try:
                    client.review_feedback(tid, "closed", note)
                    _notify_done(f"Тикет {tid} закрыт")
                except AdminApiError as exc:
                    st.error(exc.message)
            if sel.get("reviewedAt"):
                st.caption(f"Обновлено: {fmt_dt(sel.get('reviewedAt'))} · {sel.get('reviewedBy') or 'admin'}")


# ---------- Раздел 6: Пользователи и система ----------

def _render_users_and_system(client: AdminApiClient) -> None:
    st.title("Пользователи, сервисы и журнал событий")
    tab_users, tab_sys, tab_outbox = st.tabs(
        ["👥 Пользователи и роли", "🧩 Сервисы и Telegram-бот", "📡 Журнал событий Outbox"]
    )

    with tab_users:
        users = client.users(limit=300)
        if not users:
            st.info("Зарегистрированных пользователей пока нет.")
        else:
            c1, c2 = st.columns([3, 2])
            role_pick = c1.pills(
                "Роль",
                ["all", "student", "tutor", "admin"],
                default="all",
                format_func=lambda r: "Все" if r == "all" else ROLE_LABELS.get(r, r),
                key="usr_role_filter",
            ) or "all"
            search_q = c2.text_input("Поиск", placeholder="ID, имя, логин, email или способ входа", key="usr_search")

            filtered_u = [
                u for u in users
                if (role_pick == "all" or u.get("role") == role_pick)
                and _match_query(u, search_q, ("id", "username", "displayName", "email", "authProvider"))
            ]
            if not filtered_u:
                st.info("Пользователи не найдены.")
            else:
                rows_u = [
                    {
                        "ID": int(u.get("id") or 0),
                        "Имя": u.get("displayName") or u.get("username"),
                        "Логин": f"@{u.get('username')}",
                        "Email": u.get("email") or "—",
                        "Вход": AUTH_PROVIDER_LABELS.get(str(u.get("authProvider")), str(u.get("authProvider"))),
                        "Роль": ROLE_BADGES.get(str(u.get("role")), str(u.get("role"))),
                        "Регистрация": fmt_dt_short(u.get("createdAt")),
                    }
                    for u in filtered_u
                ]
                df_u = pd.DataFrame(rows_u)
                st.caption("Нажмите на пользователя в таблице, чтобы изменить роль ниже")
                ev_u = st.dataframe(
                    df_u,
                    width="stretch",
                    hide_index=True,
                    on_select="rerun",
                    selection_mode="single-row",
                    key="usr_table_sel",
                )
                st.download_button("⬇ Скачать пользователей (CSV)", data=csv_bytes(df_u), file_name="vektor-users.csv", mime="text/csv")

                sel_u = filtered_u[selected_row_idx(ev_u, len(filtered_u))]
                cur_role = str(sel_u.get("role") or "student")
                with st.container(border=True):
                    c_info, c_act = st.columns([3, 2], gap="large")
                    with c_info:
                        st.markdown(f"#### {sel_u.get('displayName') or sel_u.get('username')}")
                        st.caption(f"ID #{sel_u.get('id')} · @{sel_u.get('username')} · {ROLE_BADGES.get(cur_role, cur_role)}")
                        st.markdown(
                            f"- **Email:** `{sel_u.get('email') or '—'}`\n"
                            f"- **Способ входа:** {AUTH_PROVIDER_LABELS.get(str(sel_u.get('authProvider')), str(sel_u.get('authProvider')))} · "
                            f"**Дата регистрации:** {fmt_dt(sel_u.get('createdAt'))}"
                        )
                    with c_act:
                        st.markdown("**Быстрая смена роли**")
                        r1, r2, r3 = st.columns([1, 1.4, 0.9])
                        if r1.button("Ученик", key=f"u_stu_{sel_u['id']}", disabled=cur_role == "student", width="stretch"):
                            try:
                                client.set_user_role(int(sel_u["id"]), "student")
                                _notify_done(f"Роль @{sel_u.get('username')} изменена на «Ученик»")
                            except AdminApiError as exc:
                                st.error(exc.message)
                        if r2.button("Репетитор", key=f"u_tut_{sel_u['id']}", disabled=cur_role == "tutor", width="stretch"):
                            try:
                                client.set_user_role(int(sel_u["id"]), "tutor")
                                _notify_done(f"Роль @{sel_u.get('username')} изменена на «Преподаватель»")
                            except AdminApiError as exc:
                                st.error(exc.message)
                        if r3.button("Админ", key=f"u_adm_{sel_u['id']}", type="primary" if cur_role != "admin" else "secondary", disabled=cur_role == "admin", width="stretch"):
                            _dialog_grant_admin(client, sel_u)

    with tab_sys:
        arch = client.architecture()
        storage = arch.get("storage") or {}
        try:
            tg = client.telegram_status()
        except AdminApiError:
            tg = {}

        s1, s2 = st.columns(2)
        with s1.container(border=True):
            st.markdown("### 🗄 Хранилище данных")
            mode = str(storage.get("mode") or "sqlite")
            pg_state = storage.get("postgres", "disabled")
            st.markdown(
                f"- **Режим БД:** `{mode}`\n"
                f"- **SQLite WAL:** `{'🟢 OK' if storage.get('sqlite') == 'ok' else storage.get('sqlite', '—')}`\n"
                f"- **PostgreSQL 17:** `{pg_state}`\n"
                f"- **Outbox в очереди:** `{int(storage.get('outboxPending') or 0)}`"
            )
        with s2.container(border=True):
            st.markdown("### 🤖 Telegram-бот и уведомления")
            bot_ok = bool(tg.get("botApiEnabled"))
            bot_user = tg.get("botUsername")
            bot_name_str = f"`@{bot_user}`" if bot_user else "`не задано (TELEGRAM_BOT_USERNAME)`"
            st.markdown(
                f"- **Bot API (токен):** `{'🟢 Включён' if bot_ok else '⚪ Не настроен'}`\n"
                f"- **Имя бота:** {bot_name_str}"
            )
            st.caption("Для запуска локального polling-бота задайте `TELEGRAM_BOT_TOKEN` и выполните `bash scripts/bot_ctl.sh start`.")

        try:
            sched = client.scheduler_status()
        except AdminApiError:
            sched = {}

        with st.container(border=True):
            st.markdown("### ⏰ Фоновый планировщик (эскроу и напоминания)")
            sc1, sc2 = st.columns([3, 1])
            with sc1:
                sched_enabled = bool(sched.get("enabled", True))
                sched_running = bool(sched.get("running"))
                totals = sched.get("totals") or {}
                last_run = fmt_dt_short(sched.get("lastRunAt")) if sched.get("lastRunAt") else "ещё не запускался"
                st.markdown(
                    f"- **Состояние:** `{'🟢 Активен' if sched_running else ('🟡 Ожидает старта' if sched_enabled else '⚪ Отключён')}` · "
                    f"интервал `{int(sched.get('intervalSec') or 60)} сек.` · "
                    f"тик `#{int(sched.get('ticksTotal') or 0)}` · последний цикл: `{last_run}`\n"
                    f"- **Счётчики:** автозавершено `94%`: **{int(totals.get('captured') or 0)}** ({fmt_rub(totals.get('capturedRub'))}) · "
                    f"отменено просроченных: **{int(totals.get('expired') or 0)}** (возврат {fmt_rub(totals.get('refundedRub'))}) · "
                    f"напоминаний в TG: **{int(totals.get('reminders') or 0)}**"
                )
                if sched.get("lastError"):
                    st.warning(f"Последняя ошибка цикла: {sched.get('lastError')}")
            with sc2:
                if st.button("▶ Запустить цикл сейчас", key="sys_sched_run_btn", type="primary", width="stretch"):
                    try:
                        run_res = client.run_scheduler().get("result") or {}
                        _notify_done(
                            f"Планировщик выполнен: завершено {int(run_res.get('capturedCount') or 0)}, "
                            f"отменено {int(run_res.get('expiredCount') or 0)}, "
                            f"напоминаний {int(run_res.get('remindersCount') or 0)}"
                        )
                    except AdminApiError as exc:
                        st.error(exc.message)

        try:
            ops = client.ops_status()
        except AdminApiError:
            ops = {}

        if ops:
            mig = ops.get("migrations") or {}
            bkp = ops.get("backups") or {}
            mon = ops.get("monitoring") or {}
            ana = ops.get("analytics") or {}
            med = ops.get("media") or {}
            pay_ops = ops.get("payments") or {}
            pout_ops = ops.get("payouts") or {}
            npd_ops = ops.get("npd") or {}
            sec_ops = ops.get("security") or {}
            otp_ops = ops.get("otpDelivery") or {}
            with st.container(border=True):
                st.markdown("### 🛡 Миграции, бэкапы, алерты 5xx и аналитика")
                oc1, oc2 = st.columns([3, 1])
                with oc1:
                    cur_rev = mig.get("currentRevision") or "не применена"
                    head_rev = mig.get("headRevision") or "—"
                    mig_badge = "🟢 актуальна" if mig.get("upToDate") else "🟡 требуется alembic upgrade"
                    bkp_kb = round(float(bkp.get("totalBytes") or 0) / 1024.0, 1)
                    last_bkp = fmt_dt_short(bkp.get("lastBackupAt")) if bkp.get("lastBackupAt") else "ещё не создавался"
                    ym_label = f"🟢 счётчик `{ana.get('yandexMetrikaId')}`" if ana.get("enabled") else "⚪ не задан (`YANDEX_METRIKA_ID`)"
                    tg_alert_lbl = "🟢 TG админ-чат" if mon.get("telegramAlertsEnabled") else "⚪ TG не настроен"
                    sentry_lbl = "🟢 Sentry" if mon.get("sentryEnabled") else "⚪ Sentry выкл."
                    med_buckets = med.get("buckets") or {}
                    med_kb = round(float(med.get("totalBytes") or 0) / 1024.0, 1)
                    med_size_lbl = f" · файлов **{int(med.get('filesCount') or 0)}** ({med_kb} КБ)" if "filesCount" in med else ""
                    med_webp = med.get("avatarWebp") or {}
                    med_webp_lbl = (
                        f" · WebP <= {int(med_webp.get('maxDim') or 512)}px"
                        if med_webp.get("enabled") and med_webp.get("pillowWebp")
                        else (" · WebP выкл." if med_webp else "")
                    )
                    med_redir = med.get("redirect") or {}
                    med_redir_lbl = (
                        " · CDN/presign 307"
                        if (med_redir.get("publicRedirect") or med_redir.get("privatePresignRedirect"))
                        else ""
                    )
                    rl_store = str(sec_ops.get("rateLimiterStore") or "memory")
                    otp_store_lbl = str(sec_ops.get("otpStore") or "memory")
                    demo_lbl = "DEV_DEMO_MODE=1" if sec_ops.get("demoMode", True) else "DEV_DEMO_MODE=0 (prod)"
                    tg_gw_lbl = "TG Gateway ON" if otp_ops.get("telegramGatewayConfigured") else "TG Gateway выкл."
                    wa_otp_lbl = str(otp_ops.get("whatsappProvider") or "none")
                    sms_otp_lbl = str(otp_ops.get("smsProvider") or "none")
                    sms_fb_lbl = "SMS-фоллбэк вкл." if otp_ops.get("smsFallbackEnabled", True) else "фоллбэк выкл."
                    otp_cnt_lbl = f"отправлено **{int(otp_ops.get('sentTotal') or 0)}** · ошибок **{int(otp_ops.get('failedTotal') or 0)}**"
                    yk_prov = str(pay_ops.get("provider") or "demo")
                    yk_badge = f"🟢 ЮKassa (`{pay_ops.get('shopIdMasked') or 'configured'}`)" if pay_ops.get("yookassaConfigured") else f"⚪ `{yk_prov}`"
                    rcpt_lbl = "54-ФЗ вкл." if pay_ops.get("receiptEnabled", True) else "без 54-ФЗ"
                    po_badge = f"🟢 ЮKassa Payouts (`{pout_ops.get('agentIdMasked') or 'configured'}`)" if pout_ops.get("yookassaConfigured") else f"⚪ `{pout_ops.get('provider') or 'manual'}`"
                    po_auto_lbl = f"авто до {fmt_rub(pout_ops.get('autoMaxRub') or 15000)}" if pout_ops.get("autoDispatch", True) else "ручное подтверждение"
                    npd_prov = str(npd_ops.get("provider") or "demo")
                    npd_badge = f"🟢 `{npd_prov}`" if npd_prov in ("partner", "lknpd") else "⚪ `demo`"
                    npd_chk_lbl = "онлайн ИНН ФНС" if npd_ops.get("onlineInnCheck") else "проверка ИНН локально"
                    st.markdown(
                        f"- **Миграции Alembic ({mig.get('dialect') or 'sqlite'}):** {mig_badge} · ревизия `{cur_rev}` / head `{head_rev}`\n"
                        f"- **Автобэкапы БД:** архивов **{int(bkp.get('filesCount') or 0)}** ({bkp_kb} КБ) · интервал `{int(bkp.get('intervalHours') or 24)} ч` · последний: `{last_bkp}`\n"
                        f"- **Мониторинг 5xx:** ошибок **{int(mon.get('total5xx') or 0)}** · алертов **{int(mon.get('alertsSent') or 0)}** (подавлено {int(mon.get('alertsSuppressed') or 0)}) · {tg_alert_lbl} · {sentry_lbl}\n"
                        f"- **Яндекс Метрика (по согласию cookies):** {ym_label}\n"
                        f"- **Медиахранилище:** драйвер `{med.get('driver') or 'local'}` · бакеты `{med_buckets.get('avatars') or 'avatars-public'}`, `{med_buckets.get('diplomas') or 'diplomas-private'}`{med_size_lbl}{med_webp_lbl}{med_redir_lbl}\n"
                        f"- **Безопасность и витрина:** RateLimiter `{rl_store}` · PhoneOTP `{otp_store_lbl}` · `{demo_lbl}`\n"
                        f"- **Доставка OTP:** {tg_gw_lbl} · WhatsApp `{wa_otp_lbl}` · SMS `{sms_otp_lbl}` · {sms_fb_lbl} ({otp_cnt_lbl})\n"
                        f"- **Эквайринг (54-ФЗ):** {yk_badge} · {rcpt_lbl} · НДС код `{int(pay_ops.get('vatCode') or 1)}`\n"
                        f"- **Автовыплаты B2C (СБП / Мир):** {po_badge} · {po_auto_lbl} · мин. уроков `{int(pout_ops.get('antifraudMinLessons') or 1)}`\n"
                        f"- **Чеки НПД (ФНС «Мой налог»):** {npd_badge} · {npd_chk_lbl}"
                    )
                    if bkp.get("lastError"):
                        st.warning(f"Ошибка бэкапа: {bkp.get('lastError')}")
                with oc2:
                    if st.button("💾 Создать бэкап", key="sys_ops_backup_btn", type="primary", width="stretch"):
                        try:
                            bres = client.run_backup().get("backup") or {}
                            created = bres.get("created") or []
                            if bres.get("ok"):
                                label = created[-1].get("file") if created else "архив создан"
                                _notify_done(f"Бэкап готов: {label}")
                            else:
                                st.error(str(bres.get("error") or "Не удалось создать бэкап"))
                        except AdminApiError as exc:
                            st.error(exc.message)
                    if st.button("🔔 Тест алерта", key="sys_ops_alert_btn", width="stretch"):
                        try:
                            ares = client.send_test_alert()
                            if ares.get("telegramSent") or ares.get("sentrySent"):
                                _notify_done("Тестовый алерт доставлен в каналы мониторинга")
                            else:
                                st.info("Инцидент тест-алерта зафиксирован (TELEGRAM_ADMIN_CHAT_ID или SENTRY_DSN не заданы).")
                        except AdminApiError as exc:
                            st.error(exc.message)

                recent_errs = mon.get("recentErrors") or []
                if recent_errs:
                    with st.expander(f"Последние инциденты 5xx ({len(recent_errs)})", expanded=False):
                        df_err = pd.DataFrame(
                            [
                                {
                                    "ID": e.get("incidentId"),
                                    "Время": fmt_dt_short(e.get("occurredAt")),
                                    "HTTP": int(e.get("statusCode") or 500),
                                    "Маршрут": f"{e.get('method')} {e.get('path')}",
                                    "Тип": e.get("excType"),
                                    "Сообщение": e.get("message"),
                                }
                                for e in recent_errs
                            ]
                        )
                        st.dataframe(df_err, width="stretch", hide_index=True)

        st.subheader("Архитектурные слои экосистемы")
        layers = arch.get("layers") or []
        if layers:
            df_layers = pd.DataFrame(
                [
                    {
                        "Компонент": l.get("name"),
                        "Слой": l.get("layer"),
                        "Статус": "🟢 active" if l.get("status") == "active" else f"🔵 {l.get('status')}",
                        "Порт": str(l.get("port") or "—"),
                        "Назначение": l.get("summary"),
                    }
                    for l in layers
                ]
            )
            st.dataframe(df_layers, width="stretch", hide_index=True)

    with tab_outbox:
        events = client.outbox(limit=150)
        if not events:
            st.info("Событий Outbox пока нет.")
        else:
            topics = sorted({str(ev.get("topic") or "") for ev in events if ev.get("topic")})
            t_pick = st.pills(
                "Топик",
                ["all", *topics],
                default="all",
                format_func=lambda t: "Все топики" if t == "all" else t.replace("vektor.", ""),
                key="ob_topic_filter",
            ) or "all"
            ob_q = st.text_input("Поиск событий", placeholder="Тип события, ключ или текст", key="ob_search")

            filtered_ev = [
                ev for ev in events
                if (t_pick == "all" or ev.get("topic") == t_pick)
                and _match_query(ev, ob_q, ("id", "eventType", "topic", "partitionKey"))
            ]
            if not filtered_ev:
                st.info("Событий по фильтру не найдено.")
            else:
                df_ev = pd.DataFrame(
                    [
                        {
                            "ID": ev.get("id"),
                            "Событие": ev.get("eventType"),
                            "Топик": str(ev.get("topic") or "").replace("vektor.", ""),
                            "Ключ": ev.get("partitionKey"),
                            "Создано": fmt_dt_short(ev.get("createdAt")),
                            "Отправлено": fmt_dt_short(ev.get("publishedAt")),
                        }
                        for ev in filtered_ev
                    ]
                )
                st.caption("Нажмите на событие в таблице, чтобы посмотреть JSON-нагрузку ниже")
                ev_sel = st.dataframe(
                    df_ev,
                    width="stretch",
                    hide_index=True,
                    on_select="rerun",
                    selection_mode="single-row",
                    key="ob_table_sel",
                )
                st.download_button("⬇ Скачать Outbox (CSV)", data=csv_bytes(df_ev), file_name="vektor-outbox.csv", mime="text/csv")

                sel_ev = filtered_ev[selected_row_idx(ev_sel, len(filtered_ev))]
                with st.container(border=True):
                    st.markdown(f"#### Событие #{sel_ev.get('id')} · `{sel_ev.get('eventType')}`")
                    st.caption(f"Топик: `{sel_ev.get('topic')}` · Ключ: `{sel_ev.get('partitionKey') or '—'}`")
                    st.code(json.dumps(sel_ev.get("payload") or {}, ensure_ascii=False, indent=2), language="json")


# ---------- Точка входа ----------

def main() -> None:
    inject_styles()
    client, overview_data, ping_err, active_sec = _render_sidebar()

    if ping_err or overview_data is None:
        st.title("Подключение к Admin API")
        st.error(f"Нет доступа к бэкенду: {ping_err or 'сервер не отвечает'}")
        c1, c2 = st.columns(2)
        with c1.container(border=True):
            st.subheader("Настройки и токен")
            _render_connection_controls(st, "main_cfg")
            if st.button("Проверить подключение", type="primary", width="stretch"):
                st.rerun()
        with c2.container(border=True):
            st.subheader("Вход администратора")
            _render_session_form(st, client, "main_auth")
        return

    try:
        if active_sec == "overview":
            _render_overview(client, overview_data)
        elif active_sec == "disputes":
            _render_disputes(client)
        elif active_sec == "tutors":
            _render_tutors(client)
        elif active_sec == "payouts":
            _render_payouts(client)
        elif active_sec == "feedback":
            _render_feedback(client)
        elif active_sec == "system":
            _render_users_and_system(client)
        else:
            _render_overview(client, overview_data)
    except AdminApiError as exc:
        st.error(f"Ошибка Admin API: {exc.message} ({exc.code})")


if __name__ == "__main__":
    main()
