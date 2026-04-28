#!/usr/bin/env python3
"""
YTP Backup — YouTube Downloader (Interactive)
=============================================
Scans YTP nostrane / YTP fai da te forum pages for YouTube links,
fetches video description + channel info from YouTube, then downloads.

Requirements:
    pip install yt-dlp beautifulsoup4 lxml
"""

import os
import re
import sys
import json
import time
import glob
import shutil
import subprocess
import argparse
import datetime
import urllib.request
from pathlib import Path

from bs4 import BeautifulSoup

# ── Sections to scan ──────────────────────────────────────────────────────────

SCAN_SECTIONS = [
    "YTP nostrane", "YTP fai da te", "YTPMV dimportazione", "YTP da internet",
    "Poop in progress", "Il significato della cacca", "Collab poopeschi",
    "Club sportivo della foca grassa", "Biografie YTP"
]

# ── Disallowed channels (never scraped; removed from index if present) ────────

DISALLOWED_CHANNELS = ["Yotobi", "Croix89","animorphy","Beeeerdman","foreverKirby","TorNis Entertainment","PineappleDisciple","DarkestIntellect" "QDSS","Skillet","PeendulumLive","twkmedia","Valerio Salsero""UCn-K7GIs62ENvdQe6ZZk9-w","FunAvenue","The Chalkeaters","Fabio Mariano","Pogo","Computron"]

# ── Allowed channels (always scraped with keyword filter) ─────────────────────
    #"https://www.youtube.com/@NocoldizTV",

ITALIAN_CHANNELS = [
    "https://www.youtube.com/@100GameReaperYTP",
    "https://www.youtube.com/@125Replay",
    "https://www.youtube.com/@21stCenturyShy",
    "https://www.youtube.com/@2ndCenturyFox",
    "https://www.youtube.com/@Ace98100",
    "https://www.youtube.com/@Achille12345",
    "https://www.youtube.com/@age3rcm530",
    "https://www.youtube.com/@AgelessObsession",
    "https://www.youtube.com/@Aladauqs",
    "https://www.youtube.com/@alberisecchi7647",
    "https://www.youtube.com/@AlbyTree",
    "https://www.youtube.com/@Alel_",
    "https://www.youtube.com/@AlePoops",
    "https://www.youtube.com/@AlessandroRosmo",
    "https://www.youtube.com/@AlexanderFazio",
    "https://www.youtube.com/@alfonsoamendola3262",
    "https://www.youtube.com/@AlkeMystic",
    "https://www.youtube.com/@allafacciatua_xd",
    "https://www.youtube.com/@Andrea97YTPs",
    "https://www.youtube.com/@anonymi",
    "https://www.youtube.com/@anonymide",
    "https://www.youtube.com/@antoniocovatta",
    "https://www.youtube.com/@AntonioJuliano88",
    "https://www.youtube.com/@arghivebeenshot",
    "https://www.youtube.com/@Aros24",
    "https://www.youtube.com/@ashhousewares445",
    "https://www.youtube.com/@AssoDiDenari",
    "https://www.youtube.com/@avojaifnot",
    "https://www.youtube.com/@axelrod777",
    "https://www.youtube.com/@B5P666c",
    "https://www.youtube.com/@BarnabasB",
    "https://www.youtube.com/@Barsay",
    "https://www.youtube.com/@bassman85x",
    "https://www.youtube.com/@BDSbowling",
    "https://www.youtube.com/@blazor67",
    "https://www.youtube.com/@Blazor67",
    "https://www.youtube.com/@blazor69secondocanaledibla51",
    "https://www.youtube.com/@BleachGuitar",
    "https://www.youtube.com/@BlimfYTP",
    "https://www.youtube.com/@boari994",
    "https://www.youtube.com/@Bobomb83",
    "https://www.youtube.com/@Boltryke",
    "https://www.youtube.com/@Boogidyboo",
    "https://www.youtube.com/@bosch002",
    "https://www.youtube.com/@BowenKainZ",
    "https://www.youtube.com/@Breakass123",
    "https://www.youtube.com/@briotera",
    "https://www.youtube.com/@ButtonsTheDragon",
    "https://www.youtube.com/@cABit94",
    "https://www.youtube.com/@CanaleDarioLoSurdo",
    "https://www.youtube.com/@canesecco",
    "https://www.youtube.com/@caprastrabica2182",
    "https://www.youtube.com/@CaptnFalcon",
    "https://www.youtube.com/@Captpan6",
    "https://www.youtube.com/@celsowm",
    "https://www.youtube.com/@CerealKillzYTP",
    "https://www.youtube.com/@Cheez764",
    "https://www.youtube.com/@ChristianIce",
    "https://www.youtube.com/@cinemaverita",
    "https://www.youtube.com/@Clodd",
    "https://www.youtube.com/@Clodd97",
    "https://www.youtube.com/@ClubSound18",
    "https://www.youtube.com/@CommanderMorshu",
    "https://www.youtube.com/@concadoreno",
    "https://www.youtube.com/@CorruptionSound",
    "https://www.youtube.com/@CraaazyCat13",
    "https://www.youtube.com/@crapagent",
    "https://www.youtube.com/@CrazyPooper",
    "https://www.youtube.com/@crbenesch",
    "https://www.youtube.com/@CuddlyDream",
    "https://www.youtube.com/@cupoficewater1",
    "https://www.youtube.com/@cyphermur9t",
    "https://www.youtube.com/@DadediFRD"
    "https://www.youtube.com/@DaniloTestoh4",
    "https://www.youtube.com/@DanThoRiu",
    "https://www.youtube.com/@DarkCoffe64",
    "https://www.youtube.com/@DarkestIntellect",
    "https://www.youtube.com/@darkturn",
    "https://www.youtube.com/@Davaia",
    "https://www.youtube.com/@DavideToroh",
    "https://www.youtube.com/@DavvoYTP",
    "https://www.youtube.com/@DeadpoolDamian",
    "https://www.youtube.com/@DeltaHF89",
    "https://www.youtube.com/@demenzialproject1942",
    "https://www.youtube.com/@DemyGod",
    "https://www.youtube.com/@derdingobaron",
    "https://www.youtube.com/@despotaaa",
    "https://www.youtube.com/@DiagloTheBriosser",
    "https://www.youtube.com/@DinWar",
    "https://www.youtube.com/@DioNero94",
    "https://www.youtube.com/@djgiorgio97",
    "https://www.youtube.com/@DjpoopOfficial",
    "https://www.youtube.com/@DoctorChub",
    "https://www.youtube.com/@Doskey",
    "https://www.youtube.com/@DownOnTheBrazos",
    "https://www.youtube.com/@dreameroflove",
    "https://www.youtube.com/@dreamland94",
    "https://www.youtube.com/@DrRustico",
    "https://www.youtube.com/@DubskiDude",
    "https://www.youtube.com/@Dumno7",
    "https://www.youtube.com/@DWL1993",
    "https://www.youtube.com/@EdomanSYTP",
    "https://www.youtube.com/@eduardorpg64",
    "https://www.youtube.com/@electricthecheese",
    "https://www.youtube.com/@ElementNx",
    "https://www.youtube.com/@EliaForce1984ita",
    "https://www.youtube.com/@elibatsni",
    "https://www.youtube.com/@ensisarts",
    "https://www.youtube.com/@EpicLPer",
    "https://www.youtube.com/@ErmioLP"
    "https://www.youtube.com/@eugimosco",
    "https://www.youtube.com/@EvilYorkiz",
    "https://www.youtube.com/@fabulousfreebirds",
    "https://www.youtube.com/@fagiolone83",
    "https://www.youtube.com/@FarFedPoops",
    "https://www.youtube.com/@FCChannelTubePoop",
    "https://www.youtube.com/@Federigoo112",
    "https://www.youtube.com/@filonits"
    "https://www.youtube.com/@Flippy952",
    "https://www.youtube.com/@FoeKidman",
    "https://www.youtube.com/@Forza97",
    "https://www.youtube.com/@Franchiowtf",
    "https://www.youtube.com/@francoytp",
    "https://www.youtube.com/@Frank_675",
    "https://www.youtube.com/@Fraws87",
    "https://www.youtube.com/@frederickfrankenstein5671",
    "https://www.youtube.com/@FriendlyWarlord",
    "https://www.youtube.com/@GabryGuii"
    "https://www.youtube.com/@GabryGuii",
    "https://www.youtube.com/@Gamemasternumberone",
    "https://www.youtube.com/@gamepopper101",
    "https://www.youtube.com/@ganonvslink1000",
    "https://www.youtube.com/@Garrysmodita",
    "https://www.youtube.com/@gb7zone7",
    "https://www.youtube.com/@Ge%C9%9Bg",
    "https://www.youtube.com/@Geibuchan",
    "https://www.youtube.com/@geogeobananarap",
    "https://www.youtube.com/@Gertilish",
    "https://www.youtube.com/@gianluca104poops",
    "https://www.youtube.com/@giganticproblem666",
    "https://www.youtube.com/@giggipoops",
    "https://www.youtube.com/@gionniovarb",
    "https://www.youtube.com/@giromirgork3705",
    "https://www.youtube.com/@GliUseless",
    "https://www.youtube.com/@GoldLucario97",
    "https://www.youtube.com/@Gordon91",
    "https://www.youtube.com/@GreatBritishTurd",
    "https://www.youtube.com/@Grimlon_Ufficiale"
    "https://www.youtube.com/@guilhox",
    "https://www.youtube.com/@guysafari",
    "https://www.youtube.com/@HalDanGhor",
    "https://www.youtube.com/@HaloJaxed",
    "https://www.youtube.com/@HIKIKOMORI000",
    "https://www.youtube.com/@IdiotCamel",
    "https://www.youtube.com/@idiotcamel",
    "https://www.youtube.com/@ilCirox",
    "https://www.youtube.com/@IlPooperFiero"
    "https://www.youtube.com/@ILPOOPERRANDOM",
    "https://www.youtube.com/@ilpoveroComunistah",
    "https://www.youtube.com/@IlReDellePoop",
    "https://www.youtube.com/@IlTrioPoop",
    "https://www.youtube.com/@imaperson180",
    "https://www.youtube.com/@IndieGameMusicHD",
    "https://www.youtube.com/@Informatopi",
    "https://www.youtube.com/@inspecterclouseau",
    "https://www.youtube.com/@Iperciuk",
    "https://www.youtube.com/@ipoopanti5961",
    "https://www.youtube.com/@irover",
    "https://www.youtube.com/@ItalianHousePoop",
    "https://www.youtube.com/@IzanagiYTP",
    "https://www.youtube.com/@JacksonJunior101",
    "https://www.youtube.com/@Jakabu128",
    "https://www.youtube.com/@JakkoMatto",
    "https://www.youtube.com/@JeffLindblom",
    "https://www.youtube.com/@Jep93XxXNA",
    "https://www.youtube.com/@jeroenpompoen",
    "https://www.youtube.com/@JJokerDude",
    "https://www.youtube.com/@johncrow6541",
    "https://www.youtube.com/@JoltJolteon",
    "https://www.youtube.com/@JornalismoQuebrado",
    "https://www.youtube.com/@julaoa",
    "https://www.youtube.com/@kagemaru026",
    "https://www.youtube.com/@karinzio",
    "https://www.youtube.com/@karolikYTP"
    "https://www.youtube.com/@KefkaFTW",
    "https://www.youtube.com/@kerby",
    "https://www.youtube.com/@kevinastro",
    "https://www.youtube.com/@keyserzozzo5388",
    "https://www.youtube.com/@kifflom6910",
    "https://www.youtube.com/@kikosak1",
    "https://www.youtube.com/@kitty0706",
    "https://www.youtube.com/@KojiKabutoITA",
    "https://www.youtube.com/@KRDBrando",
    "https://www.youtube.com/@Kuhneghetz",
    "https://www.youtube.com/@kwarkman85",
    "https://www.youtube.com/@KyoSMind",
    "https://www.youtube.com/@l337toaster",
    "https://www.youtube.com/@LaGuardiaReale",
    "https://www.youtube.com/@Laizorb",
    "https://www.youtube.com/@lallegrochirurgo5540",
    "https://www.youtube.com/@lamegliogioventu",
    "https://www.youtube.com/@Laretski",
    "https://www.youtube.com/@Leemone",
    "https://www.youtube.com/@LegendarySage",
    "https://www.youtube.com/@LeNoirLive",
    "https://www.youtube.com/@lesslunatic",
    "https://www.youtube.com/@levusbevus",
    "https://www.youtube.com/@lianfromthestars",
    "https://www.youtube.com/@LightningToast3",
    "https://www.youtube.com/@lolifante",
    "https://www.youtube.com/@Loller97",
    "https://www.youtube.com/@luciomarco",
    "https://www.youtube.com/@LukTrek",
    "https://www.youtube.com/@lullo74",
    "https://www.youtube.com/@Lumpytoast",
    "https://www.youtube.com/@luxexcellence2483",
    "https://www.youtube.com/@M0rtanius",
    "https://www.youtube.com/@macioilmagno",
    "https://www.youtube.com/@madanonymous",
    "https://www.youtube.com/@mamaluigi02",
    "https://www.youtube.com/@ManakoBs",
    "https://www.youtube.com/@manuknife93",
    "https://www.youtube.com/@manusnake_",
    "https://www.youtube.com/@MaraudersClub",
    "https://www.youtube.com/@marco30074",
    "https://www.youtube.com/@Mario6493",
    "https://www.youtube.com/@mariotorrone",
    "https://www.youtube.com/@massilmitico",
    "https://www.youtube.com/@MasterAl",
    "https://www.youtube.com/@MastercastPresident",
    "https://www.youtube.com/@mattiapagano92",
    "https://www.youtube.com/@matusalemmeballerino8020",
    "https://www.youtube.com/@MclovinKillerMX",
    "https://www.youtube.com/@McMaNGOS",
    "https://www.youtube.com/@MectaPoopITA",
    "https://www.youtube.com/@MediaMunkee",
    "https://www.youtube.com/@MeStarStudios",
    "https://www.youtube.com/@MetaAndre11",
    "https://www.youtube.com/@METAL666MILITIA",
    "https://www.youtube.com/@MewMewJoanna",
    "https://www.youtube.com/@Michela_life_oac",
    "https://www.youtube.com/@mijino",
    "https://www.youtube.com/@mikycop6",
    "https://www.youtube.com/@MilkshakeManCP",
    "https://www.youtube.com/@MisterS0sa",
    "https://www.youtube.com/@Moto200Alt",
    "https://www.youtube.com/@MPCozmo",
    "https://www.youtube.com/@MPYTP",
    "https://www.youtube.com/@mr.pungolo716",
    "https://www.youtube.com/@MrApocalisse",
    "https://www.youtube.com/@MrDuePenny",
    "https://www.youtube.com/@MrFp96",
    "https://www.youtube.com/@MrLucario2",
    "https://www.youtube.com/@mrpoldoakbar2849",
    "https://www.youtube.com/@MrRoboto113",
    "https://www.youtube.com/@MrTennek",
    "https://www.youtube.com/@MrVernechannel",
    "https://www.youtube.com/@MuzicFreakNumberOne",
    "https://www.youtube.com/@MycroProcessor",
    "https://www.youtube.com/@mylestailschannel",
    "https://www.youtube.com/@n00bobliterator",
    "https://www.youtube.com/@NefosG",
    "https://www.youtube.com/@nickkarion",
    "https://www.youtube.com/@NikiPoop",
    "https://www.youtube.com/@NiklasPooper",
    "https://www.youtube.com/@nobuyukinyuu",
    "https://www.youtube.com/@NocoldizTV",
    "https://www.youtube.com/@nocoldizTV",
    "https://www.youtube.com/@noi4crazyguys",
    "https://www.youtube.com/@nomefigo6115",
    "https://www.youtube.com/@norris3942",
    "https://www.youtube.com/@Nprp",
    "https://www.youtube.com/@omgtsn",
    "https://www.youtube.com/@ophios",
    "https://www.youtube.com/@orangedo1official"
    "https://www.youtube.com/@oscurobaronerampante",
    "https://www.youtube.com/@Ottodorp",
    "https://www.youtube.com/@OutoMaisteri",
    "https://www.youtube.com/@OznerolDeAngelis",
    "https://www.youtube.com/@p00pbuster",
    "https://www.youtube.com/@PaandamanYo",
    "https://www.youtube.com/@PARAAA"
    "https://www.youtube.com/@PARAAA",
    "https://www.youtube.com/@parnas1us",
    "https://www.youtube.com/@PatrickLify",
    "https://www.youtube.com/@pendulum",
    "https://www.youtube.com/@Pennaz",
    "https://www.youtube.com/@PeppeJep93",
    "https://www.youtube.com/@Phantomat14",
    "https://www.youtube.com/@PhantomDusclops92",
    "https://www.youtube.com/@Pictocheat",
    "https://www.youtube.com/@pierlupoops",
    "https://www.youtube.com/@PigHunter4",
    "https://www.youtube.com/@piodx",
    "https://www.youtube.com/@PizzaPony",
    "https://www.youtube.com/@poFETT",
    "https://www.youtube.com/@pokemonmusicmaster",
    "https://www.youtube.com/@PoladrittoYTP",
    "https://www.youtube.com/@poopemcshit9131",
    "https://www.youtube.com/@PoopMasta88",
    "https://www.youtube.com/@pooppappero",
    "https://www.youtube.com/@PoopPinchesBack",
    "https://www.youtube.com/@PoopSlammer",
    "https://www.youtube.com/@PooPTuBeNooB",
    "https://www.youtube.com/@poponicspoops5044",
    "https://www.youtube.com/@potsugoro",
    "https://www.youtube.com/@PresidentOfJelybeans",
    "https://www.youtube.com/@PyrotheBest",
    "https://www.youtube.com/@Pyrstoyska",
    "https://www.youtube.com/@quadcoreh8080",
    "https://www.youtube.com/@Qualcunaltro1",
    "https://www.youtube.com/@QueiServerSulDue",
    "https://www.youtube.com/@QueITizio",
    "https://www.youtube.com/@QuibbyJibby",
    "https://www.youtube.com/@Raf_Tama",
    "https://www.youtube.com/@RanaBastarda",
    "https://www.youtube.com/@Ratmus1",
    "https://www.youtube.com/@rawasir",
    "https://www.youtube.com/@reddevils500a",
    "https://www.youtube.com/@Remyrue",
    "https://www.youtube.com/@RenardQueenston",
    "https://www.youtube.com/@revergo",
    "https://www.youtube.com/@RocchioSciamenna",
    "https://www.youtube.com/@rohan_ytp/featured",
    "https://www.youtube.com/@RoosterReal",
    "https://www.youtube.com/@ruach12355",
    "https://www.youtube.com/@rujoTV",
    "https://www.youtube.com/@rushnerd",
    "https://www.youtube.com/@sausism",
    "https://www.youtube.com/@SecretaryEle",
    "https://www.youtube.com/@SelceTeamProductions",
    "https://www.youtube.com/@SermetraScPA",
    "https://www.youtube.com/@ShadowtheKnuckles",
    "https://www.youtube.com/@shadowxworks",
    "https://www.youtube.com/@ShinRaNewlyEmployed",
    "https://www.youtube.com/@shroomhead1tennis",
    "https://www.youtube.com/@ShroomheadOne",
    "https://www.youtube.com/@SimixF1",
    "https://www.youtube.com/@sinpecadoweb",
    "https://www.youtube.com/@Sir_Daniel",
    "https://www.youtube.com/@skatethelife777",
    "https://www.youtube.com/@ske1988",
    "https://www.youtube.com/@Skullgirl9",
    "https://www.youtube.com/@SLBysusparidas",
    "https://www.youtube.com/@smontaggiovideo",
    "https://www.youtube.com/@sofexsp"
    "https://www.youtube.com/@Spaceoffz",
    "https://www.youtube.com/@spartanguy00",
    "https://www.youtube.com/@Spazza17",
    "https://www.youtube.com/@spring.pooper",
    "https://www.youtube.com/@Spritanium",
    "https://www.youtube.com/@StackBrains",
    "https://www.youtube.com/@StarRodMan",
    "https://www.youtube.com/@StefanoMJSMusic",
    "https://www.youtube.com/@StewBarzTube",
    "https://www.youtube.com/@supdawg444",
    "https://www.youtube.com/@SuperdarkIuigi4ever",
    "https://www.youtube.com/@superkingytp5482",
    "https://www.youtube.com/@SuperYoshi",
    "https://www.youtube.com/@Surplusx21",
    "https://www.youtube.com/@surstrommingytp"
    "https://www.youtube.com/@susanne67ful",
    "https://www.youtube.com/@svegliamiii",
    "https://www.youtube.com/@SvenFletcher",
    "https://www.youtube.com/@SwishFilmsinc",
    "https://www.youtube.com/@TabooVudu",
    "https://www.youtube.com/@Tachin1994",
    "https://www.youtube.com/@tank2tank",
    "https://www.youtube.com/@TarantoEvangelica",
    "https://www.youtube.com/@Teletubbiepoop",
    "https://www.youtube.com/@TeruChanLand",
    "https://www.youtube.com/@thecloakedinquirer",
    "https://www.youtube.com/@thecongurt",
    "https://www.youtube.com/@TheDarkRises",
    "https://www.youtube.com/@theDeamonXxX",
    "https://www.youtube.com/@TheExtremeTE",
    "https://www.youtube.com/@TheFelixxxmaster",
    "https://www.youtube.com/@TheFilippoop",
    "https://www.youtube.com/@TheGamerOfAllGamers",
    "https://www.youtube.com/@thegianchi",
    "https://www.youtube.com/@TheKingOFKings69611",
    "https://www.youtube.com/@TheKingofSilverFoxes",
    "https://www.youtube.com/@TheKooperPooper",
    "https://www.youtube.com/@TheLaxOne",
    "https://www.youtube.com/@TheMark001100",
    "https://www.youtube.com/@ThemuseshoneY",
    "https://www.youtube.com/@Themysteriouspirate",
    "https://www.youtube.com/@TheNightwisher88",
    "https://www.youtube.com/@TheNoelagghijesu",
    "https://www.youtube.com/@THEpillo234",
    "https://www.youtube.com/@TheSfronzMovies",
    "https://www.youtube.com/@TheSpeedKing96",
    "https://www.youtube.com/@TheTano97",
    "https://www.youtube.com/@TheTehniga",
    "https://www.youtube.com/@TheTeschioMan",
    "https://www.youtube.com/@TimoteiLSD",
    "https://www.youtube.com/@Tj8w",
    "https://www.youtube.com/@tomgoodmen",
    "https://www.youtube.com/@ToopofthePoop",
    "https://www.youtube.com/@TottiBest92",
    "https://www.youtube.com/@tracFelix96trac",
    "https://www.youtube.com/@TranceDJnewbie",
    "https://www.youtube.com/@Trapinch12",
    "https://www.youtube.com/@TukariSilver",
    "https://www.youtube.com/@tuttoratpoopytp",
    "https://www.youtube.com/@twinx1337",
    "https://www.youtube.com/@UberNooberPooper",
    "https://www.youtube.com/@Ultimooooooooo",
    "https://www.youtube.com/@unhoots",
    "https://www.youtube.com/@unintended84",
    "https://www.youtube.com/@universalquantifier",
    "https://www.youtube.com/@UnNicknameOriginale",
    "https://www.youtube.com/@UomoBlooper",
    "https://www.youtube.com/@USBduck",
    "https://www.youtube.com/@UtenteMacSenzaMac",
    "https://www.youtube.com/@Vacantification",
    "https://www.youtube.com/@ValeGadogni",
    "https://www.youtube.com/@vanesso100",
    "https://www.youtube.com/@Veksler96",
    "https://www.youtube.com/@Victinho6D",
    "https://www.youtube.com/@vic_vacuo",
    "https://www.youtube.com/@Vid3able",
    "https://www.youtube.com/@vlxo23",
    "https://www.youtube.com/@Voiaganto",
    "https://www.youtube.com/@voodoochildytp",
    "https://www.youtube.com/@VoodooChildYTP",
    "https://www.youtube.com/@Vorhias",
    "https://www.youtube.com/@vortaniz",
    "https://www.youtube.com/@vry-dab",
    "https://www.youtube.com/@VRY-DAB",
    "https://www.youtube.com/@Vurrix",
    "https://www.youtube.com/@wazgul",
    "https://www.youtube.com/@Whopperized",
    "https://www.youtube.com/@Whyimnotfat",
    "https://www.youtube.com/@WLB91",
    "https://www.youtube.com/@Wurfenkopf",
    "https://www.youtube.com/@XblowLyourBMind",
    "https://www.youtube.com/@XXBlackLyon92XX",
    "https://www.youtube.com/@xxsweetaddiexx",
    "https://www.youtube.com/@xycechipmusic",
    "https://www.youtube.com/@Yiulias",
    "https://www.youtube.com/@Youtubors",
    "https://www.youtube.com/@YovanniYoni",
    "https://www.youtube.com/@YTPRohan"
    "https://www.youtube.com/@Zaburac",
    "https://www.youtube.com/@Zeroxxz11",
    "https://www.youtube.com/@ZioMeso",
    "https://www.youtube.com/@ZioTok83",
    "https://www.youtube.com/c/allafacciatua_xd",
    "https://www.youtube.com/c/AssoDiDenari",
    "https://www.youtube.com/c/DerioYT",
    "https://www.youtube.com/c/ilCirox",
    "https://www.youtube.com/c/ISmattyr",
    "https://www.youtube.com/c/MPYTP",
    "https://www.youtube.com/c/RTpoop",
    "https://www.youtube.com/c/SassoStrappato",
    "https://www.youtube.com/channel/UC4HFJE8cvVXzjS1mR1HmuZw",
    "https://www.youtube.com/channel/UC4I2inDRA46XWxO_x8W_mDA",
    "https://www.youtube.com/channel/UC7Y-kAwZdFELamgM31alpPg",
    "https://www.youtube.com/channel/UCEbd4eJbmSOoRxCd-_mt6Bw",
    "https://www.youtube.com/channel/UCEyQUkC7IsKk14klgrMFzcg",
    "https://www.youtube.com/channel/UCk34FwWL3wrOqnMzmKfI5Zg",
    "https://www.youtube.com/channel/UCkp_VJMK8Z0h58v_rT9wPDQ",
    "https://www.youtube.com/channel/UCOO5X6QKGNxLUmjydleXbqg",
    "https://www.youtube.com/channel/UCpuTkFWkpBGbEZowCFQ4yrA",
    "https://www.youtube.com/channel/UCrPnrIc-m4WU6Olon3furXg",
    "https://www.youtube.com/channel/UCsZ-gR0qOy4fCNG2G8Swuhw",
    "https://www.youtube.com/channel/UCULCU79tkDsZYaVCBF0Lmhw",
    "https://www.youtube.com/channel/UCWl6FWjdCWSfWqLaNBzwHiw",
    "https://www.youtube.com/@benrichardson5798",
    "https://www.youtube.com/@ShadowtheKnuckles",
    "https://www.youtube.com/user/125Replay",
    "https://www.youtube.com/user/ChristianIce",
    "https://www.youtube.com/user/ComiCartoons",
    "https://www.youtube.com/user/CottoeFrullato",
    "https://www.youtube.com/user/DanThoRiu",
    "https://www.youtube.com/user/Davi42X",
    "https://www.youtube.com/user/EvilYorkiz",
    "https://www.youtube.com/user/IdiotCamel",
    "https://www.youtube.com/user/JakkoMatto",
    "https://www.youtube.com/user/jethrofool",
    "https://www.youtube.com/user/julaoa",
    "https://www.youtube.com/user/loller97ita",
    "https://www.youtube.com/user/MasterFelixxx",
    "https://www.youtube.com/user/mikycop6",
    "https://www.youtube.com/user/MrAepox",
    "https://www.youtube.com/user/MrLetame",
    "https://www.youtube.com/user/oskari14",
    "https://www.youtube.com/user/OurTube1011",
    "https://www.youtube.com/user/PierluPoops",
    "https://www.youtube.com/user/PopingaSay",
    "https://www.youtube.com/user/RaptorArk",
    "https://www.youtube.com/user/StewBarzTube",
    "https://www.youtube.com/user/TheTehnigga",
    "https://www.youtube.com/user/Tj8w",
    "https://www.youtube.com/user/UtenteMacSenzaMac",
    "https://www.youtube.com/user/YTPandmore",
    "https://www.youtube.com/user/ZioMeso",
    "https://www.youtube.com/user/ziomeso",
    "https://www.youtube.com/user/ZioTok83",
    "https://www.youtube.com/voodoochildytp",
    "https://youtube.com/@antchannel",
    "https://youtube.com/@AssoDiDenari",
    "https://youtube.com/@aureliogame99",
    "https://youtube.com/@azonsalus",
    "https://youtube.com/@cristianpoops2.0",
    "https://youtube.com/@giusepoop",
    "https://youtube.com/@ilfilincazzatoytp",
    "https://youtube.com/@ItalianHousePoop",
    "https://youtube.com/@p00pbuster",
    "https://youtube.com/@RanaBastarda",
    "https://youtube.com/@TheGabryOfficial",
    "https://youtube.com/@Tj8w",
    "https://youtube.com/@xeduss.",
    "https://youtube.com/@YTPRohan",
    "https://youtube.com/truocolo",
    "https://www.youtube.com/@shitmultiverse1404",
    "https://www.youtube.com/user/RaptorArk",
    "https://www.youtube.com/user/CiccioDiMaggio99",
    "https://www.youtube.com/@GiGiYTP",
    "https://www.youtube.com/@NinipeCollection",
    "https://www.youtube.com/@pizzeriablaster2872",
    "https://www.youtube.com/@TenenteColomboYTP",
    "https://www.youtube.com/@MrMrkrikka",
    "https://www.youtube.com/@Wurfenkopf",
    "https://www.youtube.com/@settebellochannel7541",
    "https://www.youtube.com/@GothCorn",
    "https://www.youtube.com/@RPS-addicted",
    "https://www.youtube.com/@thinkerytp8803",
    "https://www.youtube.com/@darkpoop478",
    "https://www.youtube.com/@ildiscepoloytpsas4006",
    "https://www.youtube.com/@Possedella",
    "https://www.youtube.com/@andrewpoops9892",
    "https://www.youtube.com/@KirParodyYTP",
    "https://www.youtube.com/@diomattone3406",
    "https://www.youtube.com/@bovinoalatoytp4293",
    "https://www.youtube.com/@therealtmaster8945",
    "https://www.youtube.com/@SM95Storage",
    "https://www.youtube.com/@NotVeryImportantButOk",
    "https://www.youtube.com/@DBS_Video",
    "https://www.youtube.com/@ytcultitalia",
    "https://www.youtube.com/@davidfxesg8475",
    "https://www.youtube.com/@evilwolf6612",
    "https://www.youtube.com/@ketchuppe3025",
    "https://www.youtube.com/@ghostangosvods9757",
    "https://www.youtube.com/@mrpoldoakbararchivio6673",
    "https://www.youtube.com/@Possedella",
    "https://www.youtube.com/@scamorza",
    "https://www.youtube.com/@freddyno.",
    "https://www.youtube.com/@impossibleisnothing",
    "https://www.youtube.com/@DaniloTestoh4",
    "https://www.youtube.com/@LeLindasOfficialChannel",
    "https://www.youtube.com/@TCResetGaming",
    "https://www.youtube.com/@frang1494",
    "https://www.youtube.com/@Pudedepla",
    "https://www.youtube.com/@impossibleisnothing",
    "https://www.youtube.com/@NinipeCollection",
    "https://www.youtube.com/@alesabbio4943",
    "https://www.youtube.com/@Possedella",
    "https://www.youtube.com/@tigerytpcanalemorto",
    "https://www.youtube.com/@luckypoop697",
    "https://www.youtube.com/@mattmine9986",
    "https://www.youtube.com/@DBS_Video",
    "https://www.youtube.com/@sharmacs284",
    "https://www.youtube.com/@karolikYTP",
    "https://www.youtube.com/@SAMURAIYTP",
    "https://www.youtube.com/@DaniloTestoh4",
    "https://www.youtube.com/@slypooper_ytp",
    "https://www.youtube.com/@SAMURAIYTP",
    "https://www.youtube.com/@ghostangosvods9757",
    "https://www.youtube.com/@DevillTM",
    "https://www.youtube.com/@ipastoryofficial5515",
    "https://www.youtube.com/@PooPpea",
    "https://www.youtube.com/@PORDYYTP-ITA",
    "https://www.youtube.com/@edpoop6793",
    "https://www.youtube.com/@doctorsuus",
    "https://www.youtube.com/@thegreatjolly3769",
    "https://www.youtube.com/@ketchuppe3025",
    "https://www.youtube.com/@MemeFactory30",
    "https://www.youtube.com/@LightDragonTutorials",
    "https://www.youtube.com/@TheFelixxxmaster",
    "https://www.youtube.com/@Houndoom97akabranflakes",
    "https://www.youtube.com/@TheMaxPooper",
    "https://www.youtube.com/@allafacciatua_xd",
    "https://www.youtube.com/@bub6279",
    "https://www.youtube.com/@ValeGadogni",
    "https://www.youtube.com/@cap_parrot6896",
    "https://www.youtube.com/@thinkerytp8803",
    "https://www.youtube.com/@00ItalianStyle00",
    "https://www.youtube.com/@bvbk8",
    "https://www.youtube.com/@Ins4n3",
    "https://www.youtube.com/@gerryscoosytp1558",
    "https://www.youtube.com/@CoolAntOnion",
    "https://www.youtube.com/@MrCulo8751",
    "https://www.youtube.com/@anything2712",
    "https://www.youtube.com/@masafailpazzo6446",
    "https://www.youtube.com/@ytpond7020",
    "https://www.youtube.com/@ytpond7020",
    "https://www.youtube.com/@giovannigiorgio7603",
    "https://www.youtube.com/@TSMGirl",
    "https://www.youtube.com/@cammelloserpente5316",
    "https://www.youtube.com/@bub6279",
    "https://www.youtube.com/@beolon7562",
    "https://www.youtube.com/@bigandrea8888",
    "https://www.youtube.com/@ilmonolito3764",
    "https://www.youtube.com/@segreto13-y5f",
    "https://www.youtube.com/@marcofazzini7740",
    "https://www.youtube.com/@FireStewieCiak_REUPLOAD",
    "https://www.youtube.com/@karolikYTP",
    "https://www.youtube.com/@YTP-world",
    "https://www.youtube.com/@LukTrek",
    "https://www.youtube.com/@Girino829",
    "https://www.youtube.com/@triziochannel",
    "https://www.youtube.com/@FireStewieCiak_REUPLOAD",
    "https://www.youtube.com/@RedGhosthell",
    "https://www.youtube.com/@LolloBarbero",
    "https://www.youtube.com/@98electivire",
    "https://www.youtube.com/@CerealKillzYTP",
    "https://www.youtube.com/@therealtmaster8945",
    "https://www.youtube.com/@OurDearNeighborIlCaroVicino",
    "https://www.youtube.com/@idiotcamel",
    "https://www.youtube.com/@TheFelixxxmaster",
    "https://www.youtube.com/@MISTERBIG",
    "https://www.youtube.com/@DannyYTP",
    "https://www.youtube.com/@rosousytp",
    "https://www.youtube.com/@mikiytp",
    "https://www.youtube.com/@revergo",
    "https://www.youtube.com/@Glitchand",
    "https://www.youtube.com/@horusytpgang7671",
    "https://www.youtube.com/@pecorasatanicavivalefoche",
    "https://www.youtube.com/@NDPS3",
    "https://www.youtube.com/@RPS-addicted",
    "https://www.youtube.com/@ghostangosvods9757",
    "https://www.youtube.com/@th3d3e90",
    "https://www.youtube.com/@therealtmaster8945",
    "https://www.youtube.com/@GothCorn",
    "https://www.youtube.com/@LolloBarbero",
    "https://www.youtube.com/@NinipeCollection",
    "https://www.youtube.com/@TenenteColomboYTP",
    "https://www.youtube.com/@MrMrkrikka",
    "https://www.youtube.com/@therealtmaster8945",
    "https://www.youtube.com/@settebellochannel7541",
    "https://www.youtube.com/@thinkerytp8803",
    "https://www.youtube.com/@ildiscepoloytpsas4006",
    "https://www.youtube.com/@darkpoop478",
    "https://www.youtube.com/@SharkL96",
    "https://www.youtube.com/@VivaleTortore259",
    "https://www.youtube.com/@LolloReactions",
    "https://www.youtube.com/@muroytp5033",
    "https://www.youtube.com/@Faniellone109",
    "https://www.youtube.com/@EngyOfficial",
    "https://www.youtube.com/@Johnbrambo117",
    "https://www.youtube.com/@giampierofuschi1438",
    "https://www.youtube.com/@TheMark001100",
    "https://www.youtube.com/@goldgameplay4237",
    "https://www.youtube.com/@therealspaghetti1121",
    "https://www.youtube.com/@tensingchannel820",
    "https://www.youtube.com/@rambozeta",
    "https://www.youtube.com/@pyrojojo3142",
    "https://www.youtube.com/@giovannigiunchi1821",
    "https://www.youtube.com/@gianytp9302",
    "https://www.youtube.com/@Fabiosult",
    "https://www.youtube.com/@vittovioletcreeper",
    "https://www.youtube.com/@BlackJack-wg4op",
    "https://www.youtube.com/@reazionisti",
    "https://www.youtube.com/@TheEdo94",
    "https://www.youtube.com/@scandynu2116",
    "https://www.youtube.com/@ivagabondideltubo9855",
    "https://www.youtube.com/@pyrojojo3142",
    "https://www.youtube.com/@demenzialproject1942",
    "https://www.youtube.com/@todd7606",
    "https://www.youtube.com/@ValeGadogni",
    "https://www.youtube.com/@maxmt_hip",
    "https://www.youtube.com/@POOP-kd7ju",
    "https://www.youtube.com/@drprocton",
    "https://www.youtube.com/@lordzero4662",
    "https://www.youtube.com/@AlexFrigobar",
    "https://www.youtube.com/@gaspardytp2577",
    "https://www.youtube.com/@iltarlo8221",
    "https://www.youtube.com/@ATOMICDUCK",
    "https://www.youtube.com/@comrademathias1754",
    "https://www.youtube.com/@ipooppersytp389",
    "https://www.youtube.com/@skrillezzo3542",
    "https://www.youtube.com/@davimar13",
    "https://www.youtube.com/@th3d3e90",
    "https://www.youtube.com/@cesarepassardi5480",
    "https://www.youtube.com/@matteosposato6431",
    "https://www.youtube.com/@JohnPerezITA",
    "https://www.youtube.com/@quentintarantentin3665",
    "https://www.youtube.com/@ytpmovies3809",
    "https://www.youtube.com/@Timoteoilmassaio",
    "https://www.youtube.com/@bazingawwyr2935",
    "https://www.youtube.com/@funnimame7279",
    "https://www.youtube.com/@antiacido7426",
    "https://www.youtube.com/@Francis-wt3qc",
    "https://www.youtube.com/@mrcarrot6339",
    "https://www.youtube.com/@Bagnosky",
    "https://www.youtube.com/@Nipposandro96",
    "https://www.youtube.com/@nicolajferretti2266",
    "https://www.youtube.com/@TheEdo94",
    "https://www.youtube.com/@castonio4274",
    "https://www.youtube.com/@ganjalfytp4096",
    "https://www.youtube.com/@SelceTeamProductions",
    "https://www.youtube.com/@dottorano9847",
    "https://www.youtube.com/@gervasoquaglia5538",
    "https://www.youtube.com/@mgcerasus4206",
    "https://www.youtube.com/@franktime3272",
    "https://www.youtube.com/@rapcolorblind3293",
    "https://www.youtube.com/@KrodinoPOOPS",
    "https://www.youtube.com/@davide_2121",
    "https://www.youtube.com/channel/UCvlTVG14PCaDENMNsLn2rtA",
    "https://www.youtube.com/@Full1channel",
    "https://www.youtube.com/@dottorano9847",
    "https://www.youtube.com/@francescosacco7659",
    "https://www.youtube.com/@OkiTHB",
    "https://www.youtube.com/@SelceTeamProductions",
    "https://www.youtube.com/@misticopoop8223",
    "https://www.youtube.com/@ginopisellino2237",
    "https://www.youtube.com/@andretorre94",
    "https://www.youtube.com/@dummgeist",
    "https://www.youtube.com/@DigiDavidex4",
    "https://www.youtube.com/@chrisredfield8653",
    "https://www.youtube.com/@slypooper_ytp",
    "https://www.youtube.com/@TheMrSminchio",
    "https://www.youtube.com/@leonicsYTP",
    "https://www.youtube.com/@salamoya9407",
    "https://www.youtube.com/@%E1%8A%A0%E1%8A%95%E1%89%AA%E1%88%8D-111",
    "https://www.youtube.com/@tubepoop9571",
    "https://www.youtube.com/@Megaleochannel",
    "https://www.youtube.com/@timmo543cx7",
    "https://www.youtube.com/@topogiammy",
    "https://www.youtube.com/@ThemuseshoneY",
    "https://www.youtube.com/@MISTERBIG",
    "https://www.youtube.com/watch?v=1a4vHEk9EQ4",
    "https://www.youtube.com/@bulboculuschannel3483",
    "https://www.youtube.com/@ilgryfftp4275",
    "https://www.youtube.com/@PoldoUncut",
    "https://www.youtube.com/@raymi3ds",
    "https://www.youtube.com/@deketisondeteibol2301",
]
ENGLISH_CHANNELS = [
    "https://www.youtube.com/@drinkcoffeewithme",
    "https://www.youtube.com/@TheFemmeReel",
    "https://www.youtube.com/@cs188",
    "https://www.youtube.com/@TwoPoundTurtle",
    "https://www.youtube.com/@KroboProductions",
    "https://www.youtube.com/@EmperorLemon",
    "https://www.youtube.com/@Deepercutt",
    "https://www.youtube.com/@Hurricoaster",
    "https://www.youtube.com/@ciciAAAHHH",
    "https://www.youtube.com/@DaThings",
    "https://www.youtube.com/user/YTPandmore",
    "https://www.youtube.com/@TheMasterPoop",
    "https://www.youtube.com/@blanegamerguymemeboi",
    "https://www.youtube.com/@MorimotoYTP",
    "https://www.youtube.com/@15SS25",
    "https://www.youtube.com/@kitty0706",
    "https://www.youtube.com/@Stegblob",
    "https://www.youtube.com/@Kajetokun",
    "https://www.youtube.com/@Captpan6",
    "https://www.youtube.com/@Paperking99",
    "https://www.youtube.com/@PeppaPigParodies",
    "https://www.youtube.com/@SchaffrillasProductions",
    "https://www.youtube.com/@Bosh",
    "https://www.youtube.com/@RoscoeMcGillicuddy",
    "https://www.youtube.com/@NPCarlsson",
    "https://www.youtube.com/@SwagPikachu",
    "https://www.youtube.com/@klystron2010",
    "https://www.youtube.com/@CoryTheNorm",
    "https://www.youtube.com/@MoBrosStudios",
    "https://www.youtube.com/@Waltman13",
    "https://www.youtube.com/@LinHeartAttack",
    "https://www.youtube.com/@Shrekardo",
    "https://www.youtube.com/@verytallbart"
]

SPANISH_CHANNELS = [
    "https://www.youtube.com/@ParodiadorAnimado",
    "https://www.youtube.com/@HDLuigi",
    "https://www.youtube.com/@Catdany",
    "https://www.youtube.com/@NinterYT",
    "https://www.youtube.com/@Reloxard",
    "https://www.youtube.com/@SLBysusparidas",
    "https://www.youtube.com/@SimixF1",
    "https://www.youtube.com/@Tachin1994",
    "https://www.youtube.com/@SLAPJACK23",
    "https://www.youtube.com/@Ayuwoki",
    "https://www.youtube.com/@Fistroman",
    "https://www.youtube.com/@MФRDO",
    "https://www.youtube.com/@Cristeve",
    "https://www.youtube.com/@SuperM",
    "https://www.youtube.com/@Gokusan925",
    "https://www.youtube.com/@DarkSchool",
    "https://www.youtube.com/@CriticalShock",
    "https://www.youtube.com/@SatanJaguar",
    "https://www.youtube.com/@Iluminatus",
    "https://www.youtube.com/@JochusPlay",
    "https://www.youtube.com/@Jaguer91",
    "https://www.youtube.com/@DeTounPoop",
    "https://www.youtube.com/@Cacamojadaman",
    "https://www.youtube.com/@AnzhyraPOOPS",
    "https://www.youtube.com/@DragonSouru",
    "https://www.youtube.com/@AlexParodiadorChileno",
    "https://www.youtube.com/@Bolivianopooper",
    "https://www.youtube.com/@Davasato",
    "https://www.youtube.com/@Davuuwart",
    "https://www.youtube.com/@DeepWeeb",
    "https://www.youtube.com/@BastianoYTP_lollll",
    "https://www.youtube.com/@Coscia333"
]

GERMAN_CHANNELS = [
    "https://www.youtube.com/@PetersKotstube",
    "https://www.youtube.com/@Sostrator",
    "https://www.youtube.com/@YTKFactory",
    "https://www.youtube.com/@FanboyAllianz",
    "https://www.youtube.com/@MinerMorsel",
    "https://www.youtube.com/@CorruptionSound",
    "https://www.youtube.com/@ShroomheadOne",
    "https://www.youtube.com/@GANOVENHABICHT",
    "https://www.youtube.com/@JuckKek"
]
FRENCH_CHANNELS = [
    "https://www.youtube.com/@PoopSlammer",
    "https://www.youtube.com/@USBduck",
    "https://www.youtube.com/@Tj8w",
    "https://www.youtube.com/@123lunatic",
    "https://www.youtube.com/@Chuiapoil",
    "https://www.youtube.com/@GUGUSlaPoop",
    "https://www.youtube.com/@jefaischierlesgens",
    "https://www.youtube.com/@Maxlefoulevrai",
    "https://www.youtube.com/@MopTheMoss",
    "https://www.youtube.com/@MystR076",
    "https://www.youtube.com/@ParodyOfStephane",
    "https://www.youtube.com/@YoonnsNewkarlottay",
    "https://www.youtube.com/@Quentingrd"
]

RUSSIAN_CHANNELS = [
    "https://www.youtube.com/@Whyimnotfat",
    "https://www.youtube.com/@gfoint",
    "https://www.youtube.com/@Shootlife2008",
    "https://www.youtube.com/@Multiprogramm",
    "https://www.youtube.com/@GTHO",
    "https://www.youtube.com/@FureonNectarmoon",
    "https://www.youtube.com/@Bezboltenko",
    "https://www.youtube.com/@Shpigun",
    "https://www.youtube.com/@SPIDEN",
    "https://www.youtube.com/@SgBash",
    "https://www.youtube.com/@SenyaLyutyy",
    "https://www.youtube.com/@iMiles",
    "https://www.youtube.com/@Inex",
    "https://www.youtube.com/@Zverobox",
    "https://www.youtube.com/@TRALLPUKANOW"
]


ALLOWED_CHANNELS = (
    RUSSIAN_CHANNELS + 
    GERMAN_CHANNELS + 
    FRENCH_CHANNELS + 
    SPANISH_CHANNELS + 
    ITALIAN_CHANNELS +
    ENGLISH_CHANNELS
)
# NocoldizTV: scrape everything except videos whose title matches these words
NOCOLDIZ_BLACKLIST = re.compile(
    r'(?i)(gameplay|hypernet|devlog|gioco|em\.Path|em\.Brace|Dwarf)'
)

# ── Channel keywords ──────────────────────────────────────────────────────────

CHANNEL_KEYWORDS = re.compile(
    r'(?i)(YTP|YTPMV|Collab|Youtube\s+poop|YT\s+Poop|Poop|Speciale'
    
    # --- YTPITA (ITALIAN) ---
    r'|matteo\s+montesi|avventure|Zeb|Collegio|Bigazzi|Soccer|Ganon|Billy\s+Mays|Branduardi|Luigi|Ambrogio|Risotto|ariete|Harry\s+potter|Round|Peppa|Grylls|Tennis|Acid|Favij|Testoh|Pingu'
    r'|Dipr[eè]|Bello\s+Figo|Germano|Grillo|Gesù|Nabbo|Yotobi|Berlusconi|Muniz|Travaglio|Nemesis|Testo|Papa|Super\s+Quark|Iscritti|YTM|YTG|MLG|YTK'
    r'|Sentence\s+Mix|Ear\s?rape|G-Major|Mondo\s+emo|Pubblicità|Spot|Spongebob|Reverse|Masking|Pitch\s+Shift'
    r'|Mosconi|Benson|Brumotti|Master\s?chef|Mister\s+Lui|Pappalardo|Sgarbi|Razzi|Salvini|Renzi|Rio\s+mare|Gerry\s+Scotti|Fazio'
    r'|Kabu|Nocoldiz|Poldo|Cloroformio|Giannino|Gianni\s+Morandi|Doraemon|Me\s+cont[ro]o\s+Te'
    # --- GLOBAL & ENGLISH CLASSICS ---
    r'|Pingas|CD-i|Morshu|Mah\s+Boi|He[\s-]?Man|Sparta\s+Remix|Scad|Stutter|Patrick|Jack\s+Black|Gourmet|The\s+king|Weegee|Spadinner|Michael\s+Rosen|Viacom|Skooks|Flex\s+Tape|Phil\s+Swift|Slap\s+Chop|Hotel\s+Mario|Hank\s+Hill|King\s+Harkinian|Zelda\s+CD-i'
    # --- YTPH (SPANISH) ---
    r'|YTPH|YTPHSHORT|YTPBR|Chavo\s+del\s+8|Pelea\s+de\s+invalidos|Vete\s+a\s+la\s+Versh|Pooppa[ñn]ol'
    # --- YTP FR (FRENCH) ---
    r'|YTPFR|YTP\s+FR|Brocante|Joueur\s+du\s+Grenier|JDG|Koh\s+Lanta|Denis\s+Brogniart|David\s+Goodenough'
    # --- YTK (GERMAN / YOUTUBE KACKE) ---
    r'|YouTube\s+Kacke|Marcell\s+D\'Avis|Peter\s+Zwegat|Kinski|Löwenzahn|Peter\s+Lustig|1&1'
    # --- RYTP (RUSSIAN) ---
    r'|RYTP|РУТП|Поцык|Повар|Сашко|Гамаз|Пенек)'
)

import re

NON_YTP_KEYWORDS = re.compile(
    r'(?i)('
    # --- GAMING (SERIOUS/LONGFORM) ---
    r'Walkthrough|Playthrough|Let\'s\s+Play|Gameplay|Longplay|No\s+Commentary|Speedrun|'
    r'Boss\s+Fight|Achievement\s+Guide|Trophy\s+Guide|100%\s+Completion|Quest\s+Line|'
    r'Partita|Giocata|Commento|Reazione|Reaction\s+ita|Dal\s+vivo|Streaming\s+ora|'
    r'Migliori\s+momenti|Highlights\s+live|Torneo|Guida\s+completa|'
    
    # --- TECH, REVIEWS & SHOPPING ---
    r'Unboxing|Review|Hands-on|Benchmark|Comparison|Specs|Tech\s+News|Setup|'
    r'Hardware|Software\s+Tutorial|How\s?to\s+Install|Step\s+by\s+Step|Buying\s+Guide|'
    r'Recensione|Prova|Test|Recensione\s+Onesta|Confronto|Loquendo'
    r'Cosa\s+ne\s+penso|Consigli\s+per\s+gli\s+acquisti|Scheda\s+Video|'
    
    # --- LIFESTYLE, VLOGS & TRENDS ---
    r'Vlog|Daily\s+Routine|GRWM|Get\s+Ready\s+With\s+Me|Haul|Q&A|'
    r'Ask\s+Me\s+Anything|Lifestyle|Life\s+Updates|Day\s+in\s+the\s+life|Travel\s+Diary|'
    r'La\s+mia\s+routine|Cosa\s+mangio|Vlog\s+ita|Viaggio\s+a|Domande\s+e\s+risposte|'
    r'Le\s+mie\s+opinioni|Draw\s+my\s+life\s+ita|Challenge\s+ita|'
    
    # --- OFFICIAL MEDIA, TV & NEWS ---
    r'Official\s+Music\s+Video|Lyric\s+Video|Sountrack|OST|Official\s+Trailer|Teaser\s+Trailer|'
    r'Full\s+Episode|News\s+Report|Breaking\s+News|Press\s+Conference|'
    r'Short\s+Film|Behind\s+the\s+Scenes|BTS|Making\s+of|'
    r'Puntata\s+intera|Episodio\s+completo|Film\s+completo|Versione\s+integrale|'
    r'Video\s+ufficiale|Audio\s+ufficiale|Sigla|Testo\s+canzone|Trailer\s+italiano|'
    r'Servizio|Conferenza\s+stampa|Reportage|'
    
    # --- EDUCATION & TUTORIAL ---
    r'Lecture|Webinar|Course|Seminar|Presentation|Keynote|Workshop|'
    r'Tutorial\s+for\s+beginners|Masterclass|Podcast\s+Episode|TED\s?Talk|'
    r'Tutorial\s+ita|Come\s+fare|Spiegazione|Lezione|Corso\s+di|'
    
    # --- MISC NON-POOP ---
    r'ASMR|Meditation|Workout|Fitness\s+Routine|Recipe|Cooking\s+Class|DIY\s+Crafts|'
    r'Fai\s+da\s+te'
    r')'
)

# Path resolution for moving the script to the scripts/ folder
SCRIPT_PATH = Path(__file__).resolve()
PROJECT_ROOT = SCRIPT_PATH.parent.parent if SCRIPT_PATH.parent.name == "scripts" else SCRIPT_PATH.parent

DEFAULT_SITE_DIR = str(PROJECT_ROOT / "site_mirror")
DEFAULT_VIDEO_DIR = str(PROJECT_ROOT / "db" / "videos")
DEFAULT_DOCS_DIR = str(PROJECT_ROOT / "db")

DEFAULT_FORMAT = "bestvideo[height<=720]+bestaudio/best[height<=720]/best"

# ── YouTube URL helpers ───────────────────────────────────────────────────────

YT_PATTERNS = [
    re.compile(r'https?://(?:www\.)?youtube\.com/watch\?[^\s"\'<>]*v=[\w-]{11}[^\s"\'<>]*', re.I),
    re.compile(r'https?://youtu\.be/([\w-]{11})[^\s"\'<>]*', re.I),
    re.compile(r'https?://(?:www\.)?youtube\.com/embed/([\w-]{11})[^\s"\'<>]*', re.I),
    re.compile(r'https?://(?:www\.)?youtube\.com/shorts/([\w-]{11})[^\s"\'<>]*', re.I),
    re.compile(r'https?://(?:www\.)?youtube-nocookie\.com/embed/([\w-]{11})[^\s"\'<>]*', re.I),
    re.compile(r'https?://(?:www\.)?youtube\.com/v/([\w-]{11})[^\s"\'<>]*', re.I),
]

YT_ID_RE = re.compile(
    r'(?:youtube\.com/(?:watch\?.*?v=|embed/|v/|shorts/)|youtu\.be/|youtube-nocookie\.com/embed/)'
    r'([\w-]{11})',
    re.I,
)

UNAVAIL_MSGS = [
    "video unavailable", "private video", "has been removed",
    "content is not available", "copyright claim",
    "account associated with this video has been terminated",
    "violates youtube's terms of service", "been removed by the uploader",
    "confirm your age", "join this channel", "members-only",
    "not available in your country", "no longer available",
]

DL_PROGRESS_RE = re.compile(
    r'\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+\s*[a-zA-Z]+)(?:\s+at\s+([\d.]+\s*[a-zA-Z/]+))?'
)

ANSI_RE = re.compile(r'\x1b\[[0-9;]*m')


def extract_video_id(url):
    m = YT_ID_RE.search(url)
    return m.group(1) if m else None


def canonical_yt_url(vid):
    return f"https://www.youtube.com/watch?v={vid}"


def channel_videos_url(channel_url):
    url = channel_url.rstrip("/")
    url = re.sub(r'/(videos|shorts|streams|playlists|about|community|featured)$', '', url)
    return url + "/videos"


def safe_filename(name, max_len=80):
    name = re.sub(r'[<>:"/\\|?*]', '_', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name[:max_len]


def thread_title_from_filename(fname):
    """'71236585_Some Thread Title.html'  →  'Some Thread Title'"""
    stem = Path(fname).stem
    m = re.match(r'^\d+_(.*)', stem)
    return m.group(1) if m else stem


def bar(pct, width=28):
    filled = int(width * pct / 100)
    return "[" + "=" * filled + " " * (width - filled) + f"] {pct:5.1f}%"


def clear_line():
    cols = shutil.get_terminal_size((80, 24)).columns
    print("\r" + " " * cols + "\r", end="", flush=True)

def do_download_language(index, video_dir, yt_format, rate_limit, retry_failed, channels_list, language, year_limit=None, skip_scan=False):
    # Check if the skip flag is True before doing anything else
    if skip_scan:
        print(f"\n>>> Skipping Language Scan as requested.")
        do_download_youtube(index, video_dir, yt_format, rate_limit, retry_failed, limit_channels=channels_list, language_filter=language)
        return 0  # Return 0 new entries since we skipped
    
    print(f"\n>>> Starting Language Scan for {len(channels_list)} channels ({language})...")
    new_entries = 0
    for chan_url in channels_list:
        base_url = chan_url.split('/featured')[0].split('/videos')[0]
        print(f"[*] Scraping channel: {base_url}",flush=True)
        
        cmd = ["yt-dlp", "--flat-playlist", "--print", "%(id)s|%(title)s|%(upload_date)s", base_url]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            lines = result.stdout.strip().split('\n')
            
            for line in lines:
                if '|' not in line: continue
                v_id, v_title, v_date = line.split('|', 2)

                # Keyword Match Check
                if CHANNEL_KEYWORDS.search(v_title):
                    if v_id not in index.data and v_id not in index.excluded_ids:
                        index.add_video(
                            video_id=v_id,
                            section="Youtube",
                            source_page=f"Language Scrape ({base_url})",
                            thread_title=v_title,
                            channel_url=base_url
                        )
                        # Tag with language immediately
                        index.data[v_id]['language'] = language
                        new_entries += 1
                        print(f"    [Found] Match: {v_title}", flush=True)
                        
                        # Save every 10 new entries
                        if new_entries % 10 == 0:
                            index.save()
                            print(f"    [LOG] Auto-saved index ({new_entries} new matches found so far)")
        except Exception as e:
            print(f"    [!] Error scraping {chan_url}: {e}")

    index.save()
    print(f"\n>>> Scraping complete. {new_entries} total matches added.")

    # Removed automatic download:
    # do_download_youtube(index, video_dir, yt_format, rate_limit, retry_failed, limit_channels=channels_list, language_filter=language)

def is_disallowed_channel(channel_name):
    if not channel_name:
        return False
    name_lower = channel_name.lower()
    return any(d.lower() in name_lower for d in DISALLOWED_CHANNELS)


def is_nocoldiz_channel(ch_url, ch_name=""):
    return "nocoldiz" in (ch_url or "").lower() or "nocoldiz" in (ch_name or "").lower()

def do_download_by_section(index, video_dir, yt_format, rate_limit):
    """
    Prompts for a section from SCAN_SECTIONS and downloads pending videos 
    belonging to that section.
    """
    print("\n--- Section Download Mode ---")
    for i, section in enumerate(SCAN_SECTIONS, 1):
        print(f"{i}) {section}")
    
    try:
        # Using flush=False for input prompts is usually fine, 
        # but the main logs need it.
        choice = int(input("\nSelect section number to download: ")) - 1
        if choice < 0 or choice >= len(SCAN_SECTIONS):
            print("Invalid selection.")
            return
        selected_section = SCAN_SECTIONS[choice]
    except ValueError:
        print("Invalid input.")
        return

    # Filter pending videos that belong to this section
    to_download = []
    for v_id, info in index.data.items():
        if v_id in index.excluded_ids:
            continue
        if info.get("status") == "pending":
            if selected_section in info.get("sections", []):
                to_download.append((v_id, info))

    if not to_download:
        print(f"\n[!] No pending videos found for section: {selected_section}")
        return

    # Flush here so you see the total count before downloads start
    print(f"\n>>> Found {len(to_download)} videos to download in '{selected_section}'.", flush=True)

    download_count = 0
    for v_id, info in to_download:
        print(f"[*] [{selected_section}] Downloading: {info.get('title', 'Unknown Title')} [{v_id}]", flush=True)
        
        # 1. Resolve the channel folder (Fix starts here)
        ch_name = info.get("channel_name")
        folder_name = safe_filename(ch_name) if ch_name else "Unknown Channel"
        out_dir = os.path.join(video_dir, folder_name)
        
        # Ensure the directory exists
        os.makedirs(out_dir, exist_ok=True)
        
        # 2. Update out_tmpl to use the channel subfolder
        out_tmpl = os.path.join(out_dir, "%(title)s [%(id)s].%(ext)s")
        
        info["status"] = "downloading"
        success = False
        cmd = ["yt-dlp", "-f", yt_format, "-o", out_tmpl, "--no-playlist", "--quiet", "--no-warnings"]        
        if rate_limit:
            cmd += ["--rate-limit", rate_limit]
        cmd.append(f"https://www.youtube.com/watch?v={v_id}")

        try:
            # subprocess.run waits for yt-dlp to finish. 
            # Once it returns, the next print will fire.
            subprocess.run(cmd, check=True)
            info["status"] = "downloaded"
            success = True
            # Added flush=True: Displays "Finished" as soon as yt-dlp exits
            print(f"    [SUCCESS] Finished: {v_id}", flush=True)
        except subprocess.CalledProcessError:
            info["status"] = "failed"
            print(f"    [FAILED] Error downloading {v_id}", flush=True)

        download_count += 1
        
        # Save index every 10 entries
        if download_count % 10 == 0:
            index.save()
            print(f"    [LOG] Auto-saved progress ({download_count}/{len(to_download)})", flush=True)

    index.save() # Final save
    print(f"\n>>> Section '{selected_section}' batch complete.", flush=True)
# ── Video Index ───────────────────────────────────────────────────────────────

class VideoIndex:
    """
    {
      "VIDEO_ID": {
        "url":          "https://www.youtube.com/watch?v=...",
        "title":         str | null,
        "description":   str | null,
        "channel_name":  str | null,
        "channel_url":   str | null,
        "publish_date":  str | null,
        "view_count":    int | null,
        "like_count":    int | null,
        "tags":          list[str],
        "nickname":      str | null,    <- author of first post of source thread
        "sections":      ["YTP nostrane", ...],
        "source_pages":  ["YTP nostrane/71236585_Title.html", ...],
        "thread_titles": ["In the Madonna — Tassista Romano", ...],
        "status":        "pending" | "downloaded" | "unavailable" | "failed",
        "local_file":    str | null,
        "mirrors":       list | null,
      }
    }
    """

    def __init__(self, video_dir, docs_dir=None):
        self.video_dir = video_dir
        # Store video_index.json in docs/ for the web visualizer
        self.docs_dir = docs_dir or DEFAULT_DOCS_DIR
        self.filepath = os.path.join(self.docs_dir, "video_index.json")
        self.data = {}
        self.actually_excluded_ids = set()
        self.sources_ids = set()
        self.excluded_ids = set() # Combined for compatibility
        self.load_excluded()

    def load_excluded(self):
        self.actually_excluded_ids = set()
        self.sources_ids = set()
        
        # 1. Load excluded_videos.json from docs dir
        excl_path = os.path.join(self.docs_dir, "excluded_videos.json")
        if os.path.exists(excl_path):
            try:
                with open(excl_path, encoding="utf-8") as f:
                    excluded_data = json.load(f)
                    if isinstance(excluded_data, dict):
                        self.actually_excluded_ids.update(excluded_data.keys())
                    elif isinstance(excluded_data, list):
                        self.actually_excluded_ids.update(excluded_data)
            except Exception as e:
                print(f"  [!] Error loading {excl_path}: {e}")
        
        # 2. Load sources_index.json from docs dir
        src_path = os.path.join(self.docs_dir, "sources_index.json")
        if os.path.exists(src_path):
            try:
                with open(src_path, encoding="utf-8") as f:
                    sources_data = json.load(f)
                    if isinstance(sources_data, dict):
                        self.sources_ids.update(sources_data.keys())
            except Exception as e:
                print(f"  [!] Error loading {src_path}: {e}")
        
        # Update combined set
        self.excluded_ids = self.actually_excluded_ids | self.sources_ids

    def load(self):
        if os.path.exists(self.filepath):
            with open(self.filepath, encoding="utf-8") as f:
                self.data = json.load(f)
            self.cleanup_index()

    def cleanup_index(self):
        """
        Removes excluded videos.
        """
        to_remove = []

        for vid, e in list(self.data.items()):
            self._fix_channel_name(e)
            # 1. Check if video is actually excluded (blacklist)
            if vid in self.actually_excluded_ids:
                to_remove.append(vid)

        if to_remove:
            print(f"  [cleanup] Removing {len(to_remove)} entries from main index...")
            for vid in to_remove:
                if vid in self.data:
                    del self.data[vid]
            self.save()

    def save(self):
        try:
            os.makedirs(self.docs_dir, exist_ok=True)
            # Use Path to normalize/resolve the path to avoid "Invalid argument" errors on Windows
            path = Path(self.filepath).resolve()
            with open(path, "w", encoding="utf-8") as f:
                json.dump(self.data, f, separators=(',', ':'), ensure_ascii=False)
        except Exception as e:
            print(f"\n  [!] Error saving index to {self.filepath}: {e}")

    def add_video(self, video_id, section, source_page, thread_title=None, nickname=None, channel_url=None):
        if video_id in self.actually_excluded_ids:
            # Skip only hard-blacklisted videos during scanning
            return

        if video_id not in self.data:
            self.data[video_id] = {
                "url": canonical_yt_url(video_id),
                "title": None,
                "description": None,
                "channel_name": None,
                "channel_url": channel_url,
                "publish_date": None,
                "view_count": None,
                "like_count": None,
                "tags": [],
                "nickname": None,
                "sections": [],
                "source_pages": [],
                "thread_titles": [],
                "status": "pending",
                "local_file": None,
                "mirrors": None,
            }
        e = self.data[video_id]
        if channel_url and not e.get("channel_url"):
            e["channel_url"] = channel_url
        if section not in e["sections"]:
            e["sections"].append(section)
        if source_page not in e["source_pages"]:
            e["source_pages"].append(source_page)
        if thread_title and thread_title not in e.get("thread_titles", []):
            e.setdefault("thread_titles", []).append(thread_title)
        if nickname and not e.get("nickname"):
            e["nickname"] = nickname
        self._fix_channel_name(e)

    def _fix_channel_name(self, e):
        """Extract channel_name from channel_url if name is missing."""
        if not e.get("channel_name") and e.get("channel_url"):
            url = e["channel_url"]
            url_clean = url.split("?")[0].rstrip("/")
            extracted = None
            if "/@" in url_clean:
                extracted = url_clean.split("/@")[-1]
            elif "/user/" in url_clean:
                extracted = url_clean.split("/user/")[-1]
            elif "/c/" in url_clean:
                extracted = url_clean.split("/c/")[-1]
            
            if extracted:
                e["channel_name"] = extracted

    def needs_metadata(self, video_id):
        e = self.data.get(video_id, {})
        
        # Don't try to fetch data for videos we know are dead/removed
        if e.get("status") == "unavailable":
            return False
            
        # Catch known yt-dlp error artifact
        if e.get("title") == "warnings.warn(":
            return True
            
        # Check if ANY of the primary metadata or stats fields are missing (None)
        return (e.get("title") is None or
                e.get("description") is None or
                e.get("channel_name") is None or
                e.get("channel_url") is None or
                e.get("publish_date") is None or
                e.get("view_count") is None or
                e.get("like_count") is None)

    def set_metadata(self, video_id, title=None, description=None,
                     channel_name=None, channel_url=None,
                     publish_date=None, view_count=None, like_count=None, tags=None):
        if video_id not in self.data:
            return
        e = self.data[video_id]
        if title:
            e["title"] = title
        if description is not None:
            e["description"] = description
        if channel_name:
            e["channel_name"] = channel_name
        if channel_url:
            e["channel_url"] = channel_url
        if publish_date is not None:
            e["publish_date"] = publish_date
        if view_count is not None:
            e["view_count"] = view_count
        if like_count is not None:
            e["like_count"] = like_count
        if tags is not None:
            e["tags"] = tags
        self._fix_channel_name(e)

    def is_done(self, vid):
        return self.data.get(vid, {}).get("status") in ("downloaded", "unavailable")

    def set_downloaded(self, vid, local_file, title=None):
        if vid in self.data:
            e = self.data[vid]
            e["status"] = "downloaded"
            e["local_file"] = local_file
            if title:
                e["title"] = title

    def set_unavailable(self, vid):
        if vid in self.data:
            self.data[vid]["status"] = "unavailable"

    def set_failed(self, vid):
        if vid in self.data:
            self.data[vid]["status"] = "failed"

    def clear_failed(self):
        for e in self.data.values():
            if e["status"] == "failed":
                e["status"] = "pending"

    def pending(self):
        return [vid for vid, e in self.data.items() 
                if e["status"] == "pending" and vid not in self.excluded_ids]

    def stats(self):
        s = {"total": 0, "downloaded": 0, "unavailable": 0, "failed": 0, "pending": 0}
        for e in self.data.values():
            s["total"] += 1
            key = e.get("status", "pending")
            s[key] = s.get(key, 0) + 1
        return s

    def remove_disallowed_channels(self):
        to_remove = [vid for vid, e in self.data.items()
                     if is_disallowed_channel(e.get("channel_name"))]
        for vid in to_remove:
            del self.data[vid]
        return len(to_remove)


# ── Scan Cache ───────────────────────────────────────────────────────────────

class ScanCache:
    """
    Tracks which HTML pages have already been scanned.
    {
      "rel/path/to/page.html": {
        "scanned_at": "2025-01-01T00:00:00",
        "video_ids":  ["id1", "id2"],
        "new_count":  2
      }
    }
    """

    def __init__(self, video_dir):
        self.filepath = os.path.join(video_dir, "scan_cache.json")
        self.data = {}

    def load(self):
        if os.path.exists(self.filepath):
            with open(self.filepath, encoding="utf-8") as f:
                self.data = json.load(f)

    def save(self):
        os.makedirs(os.path.dirname(self.filepath), exist_ok=True)
        with open(self.filepath, "w", encoding="utf-8") as f:
            json.dump(self.data, f, separators=(',', ':'), ensure_ascii=False)

    def is_scanned(self, rel_path):
        return rel_path in self.data

    def mark_scanned(self, rel_path, video_ids, new_count):
        self.data[rel_path] = {
            "scanned_at": datetime.datetime.now().isoformat(timespec="seconds"),
            "video_ids":  list(video_ids),
            "new_count":  new_count,
        }


# ── Scanner ───────────────────────────────────────────────────────────────────

class Scanner:

    def __init__(self, site_dir):
        self.site_dir = site_dir

    def scan_file(self, filepath):
        """Returns (set_of_video_ids, nickname_or_None)."""
        try:
            content = Path(filepath).read_text(encoding="utf-8", errors="replace")
        except Exception:
            return set(), None
        ids = set()
        for pat in YT_PATTERNS:
            for m in pat.finditer(content):
                vid = extract_video_id(m.group(0))
                if vid:
                    ids.add(vid)
        nickname = None
        try:
            soup = BeautifulSoup(content, "lxml")
            nick_tag = soup.find(class_="nick")
            if nick_tag:
                nickname = nick_tag.get_text(strip=True)
            for tag in soup.find_all(["a", "iframe", "embed", "object", "source", "param"]):
                for attr in ("href", "src", "data", "value"):
                    vid = extract_video_id(tag.get(attr, ""))
                    if vid:
                        ids.add(vid)
        except Exception:
            pass
        return ids, nickname

    def scan_sections(self, index, scan_cache=None, save_fn=None, save_interval=10):
        new_found = 0
        file_count = 0
        skipped = 0
        for sec in SCAN_SECTIONS:
            sec_dir = os.path.join(self.site_dir, sec)
            if not os.path.isdir(sec_dir):
                print(f"  [!] Directory not found: {sec_dir}")
                continue
            html_files = []
            for root, _, files in os.walk(sec_dir):
                for fname in files:
                    if fname.endswith((".html", ".htm")):
                        html_files.append(os.path.join(root, fname))

            print(f"  {sec}: {len(html_files)} HTML files", flush=True)
            for fpath in html_files:
                rel = os.path.relpath(fpath, self.site_dir)

                if scan_cache and scan_cache.is_scanned(rel):
                    skipped += 1
                    continue

                fname = os.path.basename(fpath)
                if re.match(r'^page_\d+\.html$', fname):
                    parent = os.path.basename(os.path.dirname(fpath))
                    thread_title = thread_title_from_filename(parent)
                else:
                    thread_title = thread_title_from_filename(fname)

                ids, nickname = self.scan_file(fpath)
                new_this_file = 0
                for vid in ids:
                    was_new = vid not in index.data
                    index.add_video(vid, sec, rel, thread_title, nickname=nickname)
                    if was_new:
                        new_found += 1
                        new_this_file += 1

                if scan_cache:
                    scan_cache.mark_scanned(rel, ids, new_this_file)

                if ids:
                    print(f"  [scan] {rel}  → {len(ids)} video(s) found, {new_this_file} new", flush=True)
                else:
                    print(f"  [scan] {rel}  → no videos", flush=True)

                file_count += 1
                if save_fn and file_count % save_interval == 0:
                    save_fn()
                    if scan_cache:
                        scan_cache.save()

        if skipped:
            print(f"  (skipped {skipped} already-scanned pages)")
        return new_found


# ── YouTube metadata ──────────────────────────────────────────────────────────

def fetch_yt_metadata(video_id):
    """
    Run yt-dlp --dump-json to get title, description, channel info, tags.
    Returns dict | 'unavailable' | None (temp error)
    """
    url = canonical_yt_url(video_id)
    try:
        r = subprocess.run(
            ["yt-dlp", "--dump-json", "--no-playlist",
             "--socket-timeout", "20", url],
            capture_output=True, text=True, timeout=60,
        )
        if r.returncode == 0 and r.stdout.strip():
            raw = next(
                (l for l in reversed(r.stdout.splitlines()) if l.strip().startswith("{")),
                None,
            )
            if raw is None:
                return None
            d = json.loads(raw)
            raw_date = d.get("upload_date")  # "20230415"
            publish_date = None
            if raw_date and len(raw_date) == 8:
                publish_date = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:]}"
            return {
                "title":        d.get("title"),
                "description":  (d.get("description") or "")[:3000],
                "channel_name": d.get("uploader") or d.get("channel"),
                "channel_url":  d.get("uploader_url") or d.get("channel_url"),
                "publish_date": publish_date,
                "view_count":   d.get("view_count"),
                "like_count":   d.get("like_count"),
                "tags":         d.get("tags") or [],
            }
        combined = (r.stdout + r.stderr).lower()
        for msg in UNAVAIL_MSGS:
            if msg in combined:
                return "unavailable"
    except Exception:
        pass
    return None


# ── Downloader ────────────────────────────────────────────────────────────────

def download_video(video_id, output_dir, yt_format, rate_limit,
                   current_num, total_num):
    """
    Download one video with a real-time per-video progress bar.
    Returns ('ok'|'exists'|'unavailable'|'error', local_file, title)
    """
    url = canonical_yt_url(video_id)
    os.makedirs(output_dir, exist_ok=True)
    outtmpl = os.path.join(output_dir, "%(title).80s - %(id)s.%(ext)s")

    cmd = [
        "yt-dlp",
        "--no-playlist", "--no-overwrites",
        "--write-thumbnail", "--convert-thumbnails", "jpg",
        "--embed-thumbnail", "--add-metadata",
        "--newline",
        "--print", "after_move:filepath",
        "--print", "%(title)s",
        "--format", yt_format,
        "--output", outtmpl,
        "--retries", "3",
        "--socket-timeout", "30",
        "--no-warnings",
    ]
    if rate_limit:
        cmd += ["--limit-rate", rate_limit]
    cmd.append(url)

    local_file = None
    title = None
    is_exists = False

    overall_pct = (current_num - 1) / total_num * 100
    ov_bar = bar(overall_pct, 15)

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        for line in proc.stdout:
            line = line.rstrip()
            if not line:
                continue

            line = ANSI_RE.sub('', line)

            if "has already been downloaded" in line:
                is_exists = True
                continue



            stripped = line.strip()
            if re.match(r'.+\.py:\d+: \w+Warning:', stripped):
                continue
            if stripped.startswith("warnings.warn("):
                continue
            if stripped and not stripped.startswith("["):
                if (os.sep in stripped or "/" in stripped) and any(
                    stripped.endswith(e)
                    for e in (".mp4", ".mkv", ".webm", ".mp3", ".m4a", ".opus")
                ):
                    local_file = stripped
                elif not title:
                    title = stripped

        proc.wait()
        clear_line()

        if not local_file:
            matches = [
                m for m in glob.glob(os.path.join(output_dir, f"* - {video_id}.*"))
                if not m.endswith((".jpg", ".png", ".webp"))
            ]
            if matches:
                local_file = matches[0]

        if is_exists:
            return "exists", local_file, title
        if proc.returncode == 0:
            return "ok", local_file, title

        return "error", None, None

    except subprocess.TimeoutExpired:
        proc.kill()
        clear_line()
        return "error", None, None
    except Exception as ex:
        clear_line()
        print(f"  [!] {ex}")
        return "error", None, None


# ── Interactive phases ────────────────────────────────────────────────────────

def do_update_index(index):
    # Skip scanning HTML pages as they are already scraped
    print("  Skipping HTML scan (all pages already scraped).")

    removed = index.remove_disallowed_channels()
    if removed:
        print(f"  Removed {removed} video(s) from disallowed channels.")
        index.save()

    st = index.stats()
    print(f"  Total videos in index: {st['total']}")
    print()

    need_meta = [vid for vid in index.data if index.needs_metadata(vid) and vid not in index.excluded_ids]

    if not need_meta:
        print("  All videos already have metadata.")
        return

    total_meta = len(need_meta)
    print(f"  Fetching YouTube metadata for {total_meta} videos")
    print(f"  (title, description, channel link, tags)...")
    print()

    for i, vid in enumerate(need_meta, 1):
        overall_pct = i / total_meta * 100
        ov_bar = bar(overall_pct, 30)
        print(f"\r  {ov_bar}  {i}/{total_meta}", end="", flush=True)

        meta = fetch_yt_metadata(vid)
        if meta == "unavailable":
            index.set_unavailable(vid)
        elif meta:
            index.set_metadata(vid, **meta)

        if i % 20 == 0:
            index.save()

    clear_line()
    index.save()

    st = index.stats()
    print(f"  Done — index updated.")
    print(f"  Total: {st['total']}  Pending: {st['pending']}  "
          f"Unavailable: {st['unavailable']}")


def do_forum_scrape(index, site_dir):
    print(f"\n>>> Starting Forum Scrape in {os.path.abspath(site_dir)}...")
    
    video_sections = {
        "YTPMV dimportazione", 
        "YTP nostrane", 
        "YTP fai da te", 
        "YTP da internet",
        "Poop in progress",
        "Il significato della cacca",
        "Collab poopeschi",
        "Club sportivo della foca grassa",
        "Biografie YTP"
    }
    
    src_path = os.path.join(index.docs_dir, "sources_index.json")
    sources_data = {}
    if os.path.exists(src_path):
        with open(src_path, encoding="utf-8") as f:
            sources_data = json.load(f)

    scanner = Scanner(site_dir)
    new_found_video = 0
    new_found_source = 0
    total_links_found = 0
    pages_scanned = 0
    
    # Walk site_mirror
    for root, dirs, files in os.walk(site_dir):
        for fname in files:
            if fname.endswith((".html", ".htm")):
                fpath = os.path.join(root, fname)
                rel_file = os.path.relpath(fpath, site_dir)
                
                # Determine section: top level folder in site_mirror
                parts = rel_file.split(os.sep)
                section = parts[0] if len(parts) >= 1 else "Unknown"
                
                target = "video" if section in video_sections else "sources"
                
                # Thread title logic
                if re.match(r'^page_\d+\.html$', fname):
                    parent = os.path.basename(os.path.dirname(fpath))
                    thread_title = thread_title_from_filename(parent)
                else:
                    thread_title = thread_title_from_filename(fname)
                    
                ids, nickname = scanner.scan_file(fpath)
                
                if ids:
                    print(f"  [scan] {rel_file} → Found {len(ids)} video(s), sorting to {target}_index", flush=True)
                    for vid in ids:
                        total_links_found += 1
                        if target == "video":
                            was_new = vid not in index.data
                            index.add_video(vid, section, rel_file, thread_title, nickname=nickname)
                            if was_new:
                                new_found_video += 1
                                print(f"    [Found] {vid} -> video_index", flush=True)
                        else:
                            # sources
                            # Don't add to sources if it already exists in video_index
                            if vid in index.data:
                                continue
                                
                            if vid not in sources_data:
                                sources_data[vid] = {
                                    "url": canonical_yt_url(vid),
                                    "title": None,
                                    "description": None,
                                    "channel_name": None,
                                    "channel_url": None,
                                    "publish_date": None,
                                    "view_count": None,
                                    "like_count": None,
                                    "tags": [],
                                    "nickname": nickname,
                                    "sections": [section],
                                    "source_pages": [rel_file],
                                    "thread_titles": [thread_title] if thread_title else [],
                                    "status": "pending",
                                    "local_file": None,
                                    "mirrors": None,
                                }
                                new_found_source += 1
                                print(f"    [Found] {vid} -> sources_index", flush=True)
                            else:
                                e = sources_data[vid]
                                if section not in e.get("sections", []):
                                    e.setdefault("sections", []).append(section)
                                if rel_file not in e.get("source_pages", []):
                                    e.setdefault("source_pages", []).append(rel_file)
                                if thread_title and thread_title not in e.get("thread_titles", []):
                                    e.setdefault("thread_titles", []).append(thread_title)

                pages_scanned += 1
                if pages_scanned % 50 == 0:
                    index.save()
                    with open(src_path, "w", encoding="utf-8") as f:
                        json.dump(sources_data, f, separators=(',', ':'), ensure_ascii=False)

    index.save()
    with open(src_path, "w", encoding="utf-8") as f:
        json.dump(sources_data, f, separators=(',', ':'), ensure_ascii=False)
        
    print(f"\n>>> Forum Scrape Complete. Scanned {pages_scanned} pages.")
    print(f"    Added {new_found_video} new videos to video_index.")
    print(f"    Added {new_found_source} new videos to sources_index.")
    print(f"    Total links processed: {total_links_found}")


def do_download(index, video_dir, yt_format, rate_limit, retry_failed):
    if retry_failed:
        index.clear_failed()
        index.save()
        print("  Cleared failed status — will retry.\n")

    pending = index.pending()
    if not pending:
        print("  Nothing to download — either run 'Update index' first")
        print("  or everything is already downloaded / unavailable.")
        return

    total = len(pending)
    print(f"  {total} videos pending.\n")

    ok_count = skip_count = unavail_count = err_count = 0

    for i, vid in enumerate(pending, 1):
        try:
            e = index.data[vid]
            
            if e.get("title") == "warnings.warn(":
                meta = fetch_yt_metadata(vid)
                if isinstance(meta, dict) and meta.get("title"):
                    e["title"] = meta["title"]
                    index.save()
                    
            sec = e["sections"][0] if e["sections"] else "Unknown"
            thread = (e.get("thread_titles") or [""])[0] or vid
            yt_title = e.get("title") or vid

            ch_name = e.get("channel_name")
            folder_name = safe_filename(ch_name) if ch_name else "Unknown Channel"
            out_dir = os.path.join(video_dir, folder_name)

            print(f"  [{i}/{total}] {thread[:60]}")
            if e.get("channel_name"):
                ch_url = e.get("channel_url", "")
                print(f"  Channel: {e['channel_name']}  {ch_url}")
            print(f"  URL:     {canonical_yt_url(vid)}")

            status, local_file, dl_title = download_video(
                vid, out_dir, yt_format, rate_limit, i, total,
            )

            if status == "ok":
                rel = os.path.relpath(local_file, ".") if local_file else None
                index.set_downloaded(vid, rel, dl_title)
                print(f"  ✓ {os.path.basename(local_file or '')}", flush=True)
                ok_count += 1
            elif status == "exists":
                if not index.is_done(vid):
                    rel = os.path.relpath(local_file, ".") if local_file else None
                    index.set_downloaded(vid, rel, dl_title)
                print(f"  = already downloaded")
                skip_count += 1
            elif status == "unavailable":
                index.set_unavailable(vid)
                print("  ⊘ Unavailable (removed / private)")
                unavail_count += 1
            else:
                index.set_failed(vid)
                print("  ✗ Failed")
                err_count += 1

            index.save()

            if status == "ok":
                time.sleep(1)
        except Exception as ex:
            print(f"\n  [!] Unexpected error processing {vid}: {ex}")
            err_count += 1

    print("─" * 54)
    print(f"  Downloaded:  {ok_count}")
    print(f"  Skipped:     {skip_count}  (already on disk)")
    print(f"  Unavailable: {unavail_count}  (removed / private)")
    print(f"  Failed:      {err_count}  (re-run to retry)")
    print(f"  Index:       {os.path.abspath(index.filepath)}")


def do_scrape_channels(index):
    """Scans channels from docs/channels_to_scrape.txt for new YTP videos matching keywords and logs details with a progress bar."""
    
    channels_file = os.path.join(index.docs_dir, "channels_to_scrape.txt")
    if not os.path.exists(channels_file):
        print(f"  [!] {channels_file} not found.")
        return
        
    with open(channels_file, "r", encoding="utf-8") as f:
        channels_to_scrape = [line.strip() for line in f if line.strip() and not line.startswith("#")]
    
    if not channels_to_scrape:
        print("  No channels defined to scrape in channels_to_scrape.txt.")
        return
        
    total_channels = len(channels_to_scrape)
    print(f"  Found {total_channels} channel(s) to scrape from {channels_file}.")
    new_total = 0
    
    for i, ch_url in enumerate(channels_to_scrape, 1):
        print(f"\n  Scraping Channel [{i}/{total_channels}]: {ch_url}")
        videos_url = channel_videos_url(ch_url)
        nocoldiz = is_nocoldiz_channel(ch_url)
        
        try:
            # Use flat-playlist to quickly get the list of video IDs and titles
            r = subprocess.run(
                ["yt-dlp", "--flat-playlist", "--dump-json", "--no-warnings", 
                 "--socket-timeout", "20", videos_url],
                capture_output=True, text=True, timeout=120,
            )
            
            if r.returncode == 0 and r.stdout.strip():
                lines = [l for l in r.stdout.splitlines() if l.strip().startswith("{")]
                total_videos = len(lines)
                
                for v_idx, line in enumerate(lines, 1):
                    # Progress bar for the videos in the current channel
                    v_pct = v_idx / total_videos * 100
                    p_bar = bar(v_pct, 30)
                    print(f"\r    {p_bar} {v_idx}/{total_videos} videos scanned", end="", flush=True)

                    try:
                        d = json.loads(line)
                        vid = d.get("id")
                        title = d.get("title", "")
                        
                        # Match logic based on CHANNEL_KEYWORDS or NOCOLDIZ_BLACKLIST
                        is_match = False
                        if nocoldiz:
                            if not NOCOLDIZ_BLACKLIST.search(title):
                                is_match = True
                        elif CHANNEL_KEYWORDS.search(title):
                            is_match = True

                        # If it matches and is not already in the index (and not excluded), log and add it
                        if is_match and vid and vid not in index.data and vid not in index.excluded_ids:
                            clear_line()
                            print(f"    [+] New keyword match found: {title} ({vid})")
                            index.add_video(vid, "Scraped Channel", videos_url, title)
                            index.set_metadata(vid, title=title, channel_url=ch_url)
                            new_total += 1
                            
                    except json.JSONDecodeError:
                        continue
                        
                clear_line()
                print(f"    Done scanning {total_videos} videos.")
            else:
                clear_line()
                print(f"    [!] No videos found or yt-dlp returned an error for {ch_url}")
                
        except subprocess.TimeoutExpired:
            clear_line()
            print(f"    [!] Timeout scraping {ch_url}")
        except Exception as e:
            clear_line()
            print(f"    [!] Error scraping {ch_url}: {e}")

    # Save all new entries to the index
    if new_total > 0:
        index.save()
        
    print(f"\n  Finished scraping channels. Added {new_total} new videos to the index.")
def do_download_youtube(index, video_dir, yt_format, rate_limit, retry_failed, limit_channels=None, language_filter=None):
    if retry_failed:
        for e in index.data.values():
            if "Youtube" in e.get("sections", []) and e["status"] == "failed":
                # If language filter is active, only reset if language matches
                if language_filter and e.get("language") != language_filter:
                    continue
                e["status"] = "pending"
        index.save()
        print("  Cleared failed status for 'Youtube' section — will retry.\n")

    def is_channel_allowed(e):
        if not limit_channels:
            return True
        ch_url = e.get("channel_url")
        if not ch_url:
            return False
        # Normalize and compare
        ch_url_norm = ch_url.split('/featured')[0].split('/videos')[0].rstrip('/')
        for allowed in limit_channels:
            allowed_norm = allowed.split('/featured')[0].split('/videos')[0].rstrip('/')
            if ch_url_norm == allowed_norm:
                return True
        return False

    def is_language_match(e):
        if not language_filter:
            return True
        return e.get("language") == language_filter

    pending = [
        vid for vid, e in index.data.items()
        if "Youtube" in e.get("sections", []) and e["status"] == "pending"
        and vid not in index.excluded_ids
        and is_channel_allowed(e)
        and is_language_match(e)
    ]

    if not pending:
        print("  Nothing to download in 'Youtube' section.")
        print("  Run 'Scrape channels' first, or everything is already downloaded.")
        return

    total = len(pending)
    print(f"  {total} 'Youtube' section video(s) pending.\n")

    ok_count = skip_count = unavail_count = err_count = 0

    for i, vid in enumerate(pending, 1):
        try:
            e = index.data[vid]
            
            if e.get("title") == "warnings.warn(":
                meta = fetch_yt_metadata(vid)
                if isinstance(meta, dict) and meta.get("title"):
                    e["title"] = meta["title"]
                    index.save()
                    
            label = (e.get("thread_titles") or [""])[0] or e.get("title") or vid

            ch_name = e.get("channel_name")
            folder_name = safe_filename(ch_name) if ch_name else "Unknown Channel"
            out_dir = os.path.join(video_dir, folder_name)

            print(f"  [{i}/{total}] {label[:60]}")
            if e.get("channel_name"):
                print(f"  Channel: {e['channel_name']}  {e.get('channel_url', '')}")
            print(f"  URL:     {canonical_yt_url(vid)}")

            status, local_file, dl_title = download_video(
                vid, out_dir, yt_format, rate_limit, i, total,
            )

            if status == "ok":
                rel = os.path.relpath(local_file, ".") if local_file else None
                index.set_downloaded(vid, rel, dl_title)
                print(f"  ✓ {os.path.basename(local_file or '')}")
                ok_count += 1
            elif status == "exists":
                if not index.is_done(vid):
                    rel = os.path.relpath(local_file, ".") if local_file else None
                    index.set_downloaded(vid, rel, dl_title)
                print(f"  = already downloaded")
                skip_count += 1
            elif status == "unavailable":
                index.set_unavailable(vid)
                print("  ⊘ Unavailable (removed / private)")
                unavail_count += 1
            else:
                index.set_failed(vid)
                print("  ✗ Failed")
                err_count += 1

            index.save()

            if status == "ok":
                time.sleep(1)
        except Exception as ex:
            print(f"\n  [!] Unexpected error processing {vid}: {ex}")
            err_count += 1

    print("─" * 54)
    print(f"  Downloaded:  {ok_count}")
    print(f"  Skipped:     {skip_count}  (already on disk)")
    print(f"  Unavailable: {unavail_count}  (removed / private)")
    print(f"  Failed:      {err_count}  (re-run to retry)")
    print(f"  Index:       {os.path.abspath(index.filepath)}")


def do_download_italian(index, video_dir, yt_format, rate_limit, retry_failed, year_limit=2030):
    def is_italian(e):
        # Must match keywords
        title = e.get("title") or ""
        if not CHANNEL_KEYWORDS.search(title):
            return False

        secs = e.get("sections", [])
        #TODO: reenable this after scraping all historic ones in secs 
        # 
        if "YTP fai da te" in secs or "YTP nostrane" in secs or "Scraped Channel" in secs or "Youtube" in secs:
            return True
        ch_url = e.get("channel_url", "")
        if ch_url:
            norm_ch = ch_url.rstrip("/").replace("/featured", "").lower()
            for ac in ALLOWED_CHANNELS:
                norm_ac = ac.rstrip("/").replace("/featured", "").lower()
                if norm_ac in norm_ch or norm_ch in norm_ac:
                    return True
        return False

    def is_in_year_range(e):
        if year_limit is None:
            return True
        pub_date = e.get("publish_date")
        if not pub_date:
            return False
        try:
            # publish_date is "YYYY-MM-DD"
            year = int(pub_date.split("-")[0])
            return year <= year_limit
        except (ValueError, IndexError):
            return False

    if retry_failed:
        for e in index.data.values():
            if is_italian(e) and is_in_year_range(e) and e["status"] == "failed":
                e["status"] = "pending"
        index.save()
        print(f"  Cleared failed status for Italian YTPs (until {year_limit}) — will retry.\n")

    pending = [
        vid for vid, e in index.data.items()
        if is_italian(e) and is_in_year_range(e) and e["status"] == "pending"
        and vid not in index.excluded_ids
    ]

    if not pending:
        print(f"  Nothing to download for Italian YTPs (until {year_limit}).")
        return

    total = len(pending)
    print(f"  {total} Italian YTP video(s) pending (until {year_limit}).\n")

    ok_count = skip_count = unavail_count = err_count = 0

    for i, vid in enumerate(pending, 1):
        try:
            e = index.data[vid]
            
            if e.get("title") == "warnings.warn(":
                meta = fetch_yt_metadata(vid)
                if isinstance(meta, dict) and meta.get("title"):
                    e["title"] = meta["title"]
                    index.save()
                    
            sec = e["sections"][0] if e["sections"] else "Unknown"
            label = (e.get("thread_titles") or [""])[0] or e.get("title") or vid
            
            ch_name = e.get("channel_name")
            folder_name = safe_filename(ch_name) if ch_name else "Unknown Channel"
            out_dir = os.path.join(video_dir, folder_name)

            print(f"  [{i}/{total}] {label[:60]}")
            if e.get("channel_name"):
                print(f"  Channel: {e['channel_name']}  {e.get('channel_url', '')}")
            print(f"  URL:     {canonical_yt_url(vid)}")

            status, local_file, dl_title = download_video(
                vid, out_dir, yt_format, rate_limit, i, total,
            )

            if status == "ok":
                rel = os.path.relpath(local_file, ".") if local_file else None
                index.set_downloaded(vid, rel, dl_title)
                print(f"  ✓ {os.path.basename(local_file or '')}")
                ok_count += 1
            elif status == "exists":
                if not index.is_done(vid):
                    rel = os.path.relpath(local_file, ".") if local_file else None
                    index.set_downloaded(vid, rel, dl_title)
                print(f"  = already downloaded")
                skip_count += 1
            elif status == "unavailable":
                index.set_unavailable(vid)
                print("  ⊘ Unavailable (removed / private)")
                unavail_count += 1
            else:
                index.set_failed(vid)
                print("  ✗ Failed")
                err_count += 1

            index.save()

            if status == "ok":
                time.sleep(1)
        except Exception as ex:
            print(f"\n  [!] Unexpected error processing {vid}: {ex}")
            err_count += 1

    print("─" * 54)
    print(f"  Downloaded:  {ok_count}")
    print(f"  Skipped:     {skip_count}  (already on disk)")
    print(f"  Unavailable: {unavail_count}  (removed / private)")
    print(f"  Failed:      {err_count}  (re-run to retry)")
    print(f"  Index:       {os.path.abspath(index.filepath)}")



def do_download_risorse(index, video_dir, yt_format, rate_limit, retry_failed):
    src_path = os.path.join(index.docs_dir, "sources_index.json")
    if not os.path.exists(src_path):
        print(f"  [!] {src_path} not found.")
        return

    with open(src_path, encoding="utf-8") as f:
        sources_data = json.load(f)

    if retry_failed:
        for e in sources_data.values():
            if e.get("status") == "failed":
                e["status"] = "pending"
        with open(src_path, "w", encoding="utf-8") as f:
            json.dump(sources_data, f, separators=(',', ':'), ensure_ascii=False)
        print("  Cleared failed status in sources_index.json — will retry.\n")

    pending = [vid for vid, e in sources_data.items() if e.get("status") == "pending"]

    if not pending:
        print("  Nothing to download in sources_index.json.")
        return

    total = len(pending)
    print(f"  {total} source video(s) pending.\n")

    ok_count = skip_count = unavail_count = err_count = 0

    for i, vid in enumerate(pending, 1):
        try:
            e = sources_data[vid]

            ch_name = e.get("channel_name")
            folder_name = safe_filename(ch_name) if ch_name else "Unknown Channel"
            # Target directory is ./sources/[channel_name]
            out_dir = os.path.join(os.path.dirname(os.path.abspath(index.filepath)), "..", "sources", folder_name)
            os.makedirs(out_dir, exist_ok=True)
            # -------------------------------------------------------
            
            if e.get("title") == "warnings.warn(":
                meta = fetch_yt_metadata(vid)  # Ensure this is defined in your scope
                if isinstance(meta, dict) and meta.get("title"):
                    e["title"] = meta["title"]
                    
            label = (e.get("thread_titles") or [""])[0] or e.get("title") or vid

            print(f"  [{i}/{total}] {label[:60]}")
            if e.get("channel_name"):
                print(f"  Channel: {e['channel_name']}  {e.get('channel_url', '')}")
            print(f"  URL:     {canonical_yt_url(vid)}") # Ensure this is defined in your scope

            status, local_file, dl_title = download_video(
                vid, out_dir, yt_format, rate_limit, i, total,
            )

            if status == "ok":
                e["status"] = "downloaded"
                e["local_file"] = os.path.relpath(local_file, ".") if local_file else None
                if dl_title: e["title"] = dl_title
                print(f"  ✓ {os.path.basename(local_file or '')}")
                ok_count += 1
            elif status == "exists":
                e["status"] = "downloaded"
                e["local_file"] = os.path.relpath(local_file, ".") if local_file else None
                if dl_title: e["title"] = dl_title
                print(f"  = already downloaded")
                skip_count += 1
            elif status == "unavailable":
                e["status"] = "unavailable"
                print("  ⊘ Unavailable (removed / private)")
                unavail_count += 1
            else:
                e["status"] = "failed"
                print("  ✗ Failed")
                err_count += 1

            # Save after each download
            with open(src_path, "w", encoding="utf-8") as f:
                json.dump(sources_data, f, separators=(',', ':'), ensure_ascii=False)

            if status == "ok":
                time.sleep(1)
        except Exception as ex:
            print(f"\n  [!] Unexpected error processing {vid}: {ex}")
            err_count += 1

    print("─" * 54)
    print(f"  Downloaded:  {ok_count}")
    print(f"  Skipped:     {skip_count}")
    print(f"  Unavailable: {unavail_count}")
    print(f"  Failed:      {err_count}")
    print(f"  Sources:     {os.path.abspath(src_path)}")

def do_stats(index, output_path="stats.md"):
    from collections import defaultdict

    src_path = os.path.join(index.docs_dir, "sources_index.json")
    if not os.path.exists(src_path):
        print(f"  [!] {src_path} not found.")
        return

    with open(src_path, encoding="utf-8") as f:
        sources_data = json.load(f)

    if not sources_data:
        print("  sources_index.json is empty.")
        return

    filtered = sources_data

    # Grand totals (unique video count)
    grand = {"total": len(filtered), "downloaded": 0, "unavailable": 0,
             "pending": 0, "failed": 0}
    for e in filtered.values():
        st = e.get("status", "pending")
        grand[st] = grand.get(st, 0) + 1

    grand_pct = (f"{grand['unavailable'] / grand['total'] * 100:.1f}%"
                 if grand["total"] else "—")

    # Per-channel table
    channels = defaultdict(lambda: {"total": 0, "downloaded": 0, "unavailable": 0,
                                     "pending": 0, "failed": 0})
    for e in filtered.values():
        name = e.get("channel_name") or "(unknown)"
        ch = channels[name]
        ch["total"] += 1
        ch[e.get("status", "pending")] += 1

    rows = sorted(channels.items(), key=lambda x: x[1]["total"], reverse=True)

    # Build markdown
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    md = [f"# YTP Backup Sources Stats", f"", f"Generated: {now}", ""]

    md += ["## Totals", ""]
    md += ["| Total | Downloaded | Unavailable | % N/A | Pending | Failed |"]
    md += ["|---|---|---|---|---|---|"]
    md.append(
        f"| **{grand['total']}** | **{grand['downloaded']}** | "
        f"**{grand['unavailable']}** | **{grand_pct}** | **{grand['pending']}** | **{grand['failed']}** |"
    )
    md += [""]

    md += ["## Channels", ""]
    md += ["| Channel | Total | DL | N/A | % N/A | Pending | Failed |"]
    md += ["|---|---|---|---|---|---|---|"]
    for name, c in rows:
        t = c["total"]
        u = c["unavailable"]
        pct = f"{u / t * 100:.1f}%" if t else "—"
        n = name.replace("|", "\\|")
        md.append(f"| {n} | {t} | {c['downloaded']} | {u} | {pct} | {c['pending']} | {c['failed']} |")
    md += [""]

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(md))
    print(f"  Stats written → {os.path.abspath(output_path)}")

    # Print summary to terminal
    print(f"\n  {'TOTAL':<32} {grand['total']:>5}  {grand['unavailable']:>4}  {grand_pct:>6}")
    print()


def do_chronology(index, top_n=20):
    if not index.data:
        print("  Index is empty. Run 'Update index' first.")
        return

    candidates = [
        e for e in index.data.values()
        if e.get("status") != "unavailable"
        and e.get("title")
        and e.get("title") != "warnings.warn("
        and e.get("view_count") is not None
    ]

    if not candidates:
        print("  No view count data yet. Run 'Update index' to fetch metadata.")
        return

    top = sorted(candidates, key=lambda e: e.get("view_count") or 0, reverse=True)[:top_n]
    top.sort(key=lambda e: e.get("publish_date") or "")

    col_title   = 40
    col_channel = 22
    header = (f"  {'#':>3}  {'Year':<4}  {'Title':<{col_title}}  "
              f"{'Channel':<{col_channel}}  {'Views':>10}  {'Likes':>8}")
    sep    = "  " + "-" * (len(header) - 2)

    print()
    print(header)
    print(sep)
    for rank, e in enumerate(top, 1):
        year    = (e.get("publish_date") or "????")[:4]
        title   = (e.get("title") or "")[:col_title]
        channel = (e.get("channel_name") or "")[:col_channel]
        views   = e.get("view_count")
        likes   = e.get("like_count")
        views_s = f"{views:,}" if views is not None else "—"
        likes_s = f"{likes:,}" if likes is not None else "—"
        print(f"  {rank:>3}  {year:<4}  {title:<{col_title}}  "
              f"{channel:<{col_channel}}  {views_s:>10}  {likes_s:>8}")
    print(sep)
    print(f"  Top {len(top)} most-viewed videos (of {len(candidates)} with view data), sorted by year")
    print()


def _fmt_views_it(n):
    """Italian-style compact view count: 1,2 mln / 310K / 5 / —"""
    if n is None:
        return "—"
    if n >= 1_000_000_000:
        v = n / 1_000_000_000
        s = f"{v:.1f}".replace(".", ",")
        return f"{s} mrd" if v != int(v) else f"{int(v)} mrd"
    if n >= 1_000_000:
        v = n / 1_000_000
        s = f"{v:.1f}".replace(".", ",")
        return f"{s} mln" if v != int(v) else f"{int(v)} mln"
    if n >= 1_000:
        v = n / 1_000
        s = f"{v:.1f}".replace(".", ",")
        return f"{s}K" if v != int(v) else f"{int(v)}K"
    return str(n)


def do_find_mirrors(index):
    """Search YouTube for reuploads of unavailable videos."""
    candidates = [
        (vid, e) for vid, e in index.data.items()
        if e.get("status") == "unavailable" and not e.get("mirrors")
        and vid not in index.excluded_ids
    ]

    if not candidates:
        print("  No unavailable videos without mirror data found.")
        return

    total = len(candidates)
    print(f"  Searching for mirrors of {total} unavailable video(s)...")
    print()

    found_count = 0

    for i, (vid, e) in enumerate(candidates, 1):
        pct = i / total * 100
        pb = bar(pct, 28)
        print(f"\r  {pb}  {i}/{total}  found={found_count}  ", end="", flush=True)

        title = e.get("title")
        thread_title = (e.get("thread_titles") or [None])[0]

        # Try video title first, fall back to thread title
        queries = [q for q in [title, thread_title] if q and q.strip()]
        if not queries:
            e["mirrors"] = []
            continue

        mirrors = []
        for query in queries:
            query_safe = query[:100]
            try:
                r = subprocess.run(
                    ["yt-dlp", f"ytsearch5:{query_safe}",
                     "--flat-playlist", "--dump-json",
                     "--no-warnings", "--socket-timeout", "20"],
                    capture_output=True, text=True, timeout=60,
                )
                for line in r.stdout.splitlines():
                    if not line.strip().startswith("{"):
                        continue
                    try:
                        d = json.loads(line)
                        found_vid = d.get("id")
                        found_title = d.get("title") or ""
                        if found_vid and found_vid != vid:
                            mirrors.append({
                                "id":           found_vid,
                                "title":        found_title,
                                "url":          canonical_yt_url(found_vid),
                                "search_query": query_safe,
                            })
                    except json.JSONDecodeError:
                        continue
            except (subprocess.TimeoutExpired, Exception):
                continue

            if mirrors:
                break  # found results on first query, no need for fallback

        e["mirrors"] = mirrors
        if mirrors:
            found_count += 1

        if i % 10 == 0:
            index.save()

    clear_line()
    index.save()
    print(f"  Found potential mirrors for {found_count} / {total} unavailable videos.")
    print(f"  Mirror data stored in 'mirrors' field of video_index.json.")


def do_scrape_thumbnails(index, docs_dir):
    import requests
    from bs4 import BeautifulSoup
    import os
    import json
    
    input_file = os.path.join(docs_dir, "ytpoopers_index.json")
    output_folder = os.path.join(docs_dir, "profile_thumbnails")
    
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)
        print(f"  Created folder: {output_folder}/")
        
    youtubers_data = {}
    if os.path.exists(input_file):
        try:
            with open(input_file, "r", encoding="utf-8") as f:
                youtubers_data = json.load(f)
        except json.JSONDecodeError:
            print(f"  [!] Error: The file '{input_file}' is not a valid JSON file.")
            return
    
    changes_made = False

    # 1. Collect unique channels from the main index (video_index.json)
    print("  Syncing channels from video_index.json...")
    for e in index.data.values():
        ch_url = e.get("channel_url")
        ch_name = e.get("channel_name")
        if ch_url and ch_url not in youtubers_data:
            youtubers_data[ch_url] = {
                "channel_name": ch_name,
                "channel_url": ch_url,
                "description": None,
                "subscriber_count": None,
                "creation_date": None,
                "thumbnail": None,
            }
            changes_made = True

    # 2. Collect unique channels from sources_index.json
    print("  Syncing channels from sources_index.json...")
    src_path = os.path.join(docs_dir, "sources_index.json")
    if os.path.exists(src_path):
        try:
            with open(src_path, encoding="utf-8") as f:
                sources_data = json.load(f)
            for e in sources_data.values():
                ch_url = e.get("channel_url")
                ch_name = e.get("channel_name")
                if ch_url and ch_url not in youtubers_data:
                    youtubers_data[ch_url] = {
                        "channel_name": ch_name,
                        "channel_url": ch_url,
                        "description": None,
                        "subscriber_count": None,
                        "creation_date": None,
                        "thumbnail": None,
                    }
                    changes_made = True
        except Exception as e:
            print(f"  [!] Error reading sources_index.json: {e}")

    if changes_made:
        print(f"  [+] Updated ytpoopers_index.json with new channels.")
        with open(input_file, "w", encoding="utf-8") as f:
            json.dump(youtubers_data, f, separators=(',', ':'), ensure_ascii=False)
        changes_made = False # Reset for thumbnail tracking

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    }

    for url, info in youtubers_data.items():
        # Tag missing profile names from URL if null
        if not info.get("channel_name"):
            url_clean = url.split("?")[0].rstrip("/")
            extracted = None
            if "/@" in url_clean:
                extracted = url_clean.split("/@")[-1]
            elif "/user/" in url_clean:
                extracted = url_clean.split("/user/")[-1]
            elif "/c/" in url_clean:
                extracted = url_clean.split("/c/")[-1]
            
            if extracted:
                info["channel_name"] = extracted
                changes_made = True
                print(f"  [Tagging] {url} -> {extracted}")

        channel_name = info.get("channel_name") or "UnknownChannel"
        
        # Skip if thumbnail already exists
        safe_name = "".join(c for c in channel_name if c.isalnum() or c in " _-").strip()
        if not safe_name:
            safe_name = "UnknownChannel"
        filename = f"{safe_name}.jpg"
        file_path = os.path.join(output_folder, filename)
        
        if os.path.exists(file_path):
            if not info.get("thumbnail"):
                info["thumbnail"] = filename
                changes_made = True
            continue

        print(f"  Processing {channel_name}...")
        
        try:
            response = requests.get(url, headers=headers)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, "html.parser")
            meta_tag = soup.find("meta", property="og:image")
            
            if meta_tag and meta_tag.get("content"):
                img_url = meta_tag["content"]
                
                img_data = requests.get(img_url, headers=headers).content
                
                with open(file_path, "wb") as f:
                    f.write(img_data)
                    
                info["thumbnail"] = filename
                changes_made = True
                    
                print(f"   [+] Saved profile picture to {file_path}")
            else:
                print(f"   [-] Could not find profile picture for {channel_name}")
                
        except requests.exceptions.RequestException as e:
            print(f"   [!] Network error processing {channel_name}: {e}")
        except Exception as e:
            print(f"   [!] Unexpected error processing {channel_name}: {e}")

    if changes_made:
        print(f"\n  Updating {input_file} with new thumbnail filenames...")
        try:
            with open(input_file, "w", encoding="utf-8") as f:
                json.dump(youtubers_data, f, separators=(',', ':'), ensure_ascii=False)
            print("   [+] JSON file updated successfully.")
        except Exception as e:
            print(f"   [!] Error saving back to '{input_file}': {e}")
    else:
        print("\n  No thumbnails were downloaded, so the JSON file was not modified.")


def do_auto_languages(index):
    print("  Auto-tagging languages...")
    import re
    from collections import defaultdict

    # ── Build channel_url → language lookup from the known channel lists ──
    def _normalize_url(url):
        """Normalize a channel URL for reliable matching."""
        url = url.strip().rstrip("/")
        url = url.split("/featured")[0]
        url = url.replace("http://", "https://")
        if url.startswith("https://youtube.com"):
            url = url.replace("https://youtube.com", "https://www.youtube.com", 1)
        return url.lower()

    channel_lang_map = {}  # normalized_url → language
    lang_channel_lists = {
        "italian":  ITALIAN_CHANNELS,
        "english":  ENGLISH_CHANNELS,
        "spanish":  SPANISH_CHANNELS,
        "german":   GERMAN_CHANNELS,
        "french":   FRENCH_CHANNELS,
        "russian":  RUSSIAN_CHANNELS,
    }
    for lang, ch_list in lang_channel_lists.items():
        for url in ch_list:
            norm = _normalize_url(url)
            # First entry wins — don't overwrite if already mapped
            if norm not in channel_lang_map:
                channel_lang_map[norm] = lang

    print(f"  Loaded {len(channel_lang_map)} unique channel URLs across {len(lang_channel_lists)} languages.")

    # ── Keyword-based fallback patterns ──
    patterns = {
        "spanish": [
            r'YTPH|YTPBR|Chavo\s+del\s+8|Loquendo|Pelea\s+de\s+invalidos|Vete\s+a\s+la\s+Versh|Pooppa[ñn]ol'
        ],
        "french": [
            r'YTPFR|YTP\s+FR|Brocante|Joueur\s+du\s+Grenier|JDG|Koh\s+Lanta|Denis\s+Brogniart|David\s+Goodenough'
        ],
        "german": [
            r'YouTube\s+Kacke|Marcell\s+D\'Avis|Peter\s+Zwegat|Kinski|Löwenzahn|Peter\s+Lustig|1&1'
        ],
        "russian": [
            r'RYTP|РУТП|Поцык|Повар|Сашко|Гамаз|Пенек'
        ],
        "italian": [
            r'matteo\s+montesi|avventure|Zeb|Collegio|Bigazzi|Soccer|Ganon|Billy\s+Mays|Branduardi|Luigi|Ambrogio|Risotto|ariete|Harry\s+potter|Round|Peppa|Grylls|Tennis|Acid|Favij|Testoh|Pingu',
            r'Dipr[eè]|Bello\s+Figo|Germano|Grillo|Gesù|Nabbo|Yotobi|Berlusconi|Muniz|Travaglio|Nemesis|Testo|Papa|Super\s+Quark|Iscritti|YTM|YTG|MLG|YTK',
            r'Sentence\s+Mix|Ear\s?rape|G-Major|Mondo\s+emo|Pubblicità|Spot|Spongebob|Reverse|Masking|Pitch\s+Shift',
            r'Mosconi|Benson|Brumotti|Master\s?chef|Mister\s+Lui|Pappalardo|Sgarbi|Razzi|Salvini|Renzi|Rio\s+mare|Gerry\s+Scotti|Fazio',
            r'Kabu|Nocoldiz|Poldo|Cloroformio|Giannino|Gianni\s+Morandi|Doraemon|Me\s+cont[ro]o\s+Te'
        ]
    }

    compiled_patterns = {}
    for lang, p_list in patterns.items():
        combined = '|'.join(p_list)
        compiled_patterns[lang] = re.compile(combined, re.IGNORECASE)

    count = 0
    channel_match_count = 0
    keyword_match_count = 0
    tagged_counts = {lang: 0 for lang in lang_channel_lists}
    channels_by_lang = defaultdict(set)

    for video_id, video in index.data.items():
        if video.get('language'):
            continue
        title = video.get('title')
        thread_titles = video.get('thread_titles', [])
        channel_url = video.get('channel_url')

        matched_lang = None

        # ── Priority 1: match by known channel lists ──
        if channel_url:
            norm_url = _normalize_url(channel_url)
            matched_lang = channel_lang_map.get(norm_url)
            if matched_lang:
                channel_match_count += 1

        # ── Priority 2: keyword regex fallback ──
        if not matched_lang:
            search_text = []
            if title:
                search_text.append(title)
            if thread_titles:
                search_text.extend(thread_titles)

            full_text = " ".join(search_text)

            if full_text:
                for lang, regex in compiled_patterns.items():
                    if regex.search(full_text):
                        matched_lang = lang
                        keyword_match_count += 1
                        break

        if matched_lang:
            video['language'] = matched_lang
            tagged_counts[matched_lang] += 1
            count += 1

            if channel_url:
                channels_by_lang[matched_lang].add(channel_url)

    print(f"  Finished tagging. Total videos updated: {count}")
    print(f"    (channel-list matches: {channel_match_count}, keyword matches: {keyword_match_count})")
    for lang, c in sorted(tagged_counts.items()):
        print(f"    - {lang}: {c}")

    index.save()

    channels_file = os.path.join(index.docs_dir, 'channels_by_language.txt')
    print(f"  Exporting channels to {channels_file}...")
    with open(channels_file, 'w', encoding='utf-8') as f:
        for lang, urls in sorted(channels_by_lang.items()):
            var_name = f"{lang.upper()}_CHANNELS"
            f.write(f"{var_name} = [\n")
            for url in sorted(list(urls)):
                f.write(f"    \"{url}\",\n")
            f.write("]\n\n")


def do_scrape_profiles(index, docs_dir):
    """Scrape channel profiles (name, description, thumbnail, subscribers, date) for all unique channels."""
    if not index.data:
        print("  Index is empty. Run 'Update index' first.")
        return

    # Collect unique channels from the index
    channel_map = {}  # channel_url -> channel_name
    for e in index.data.values():
        ch_url = e.get("channel_url")
        ch_name = e.get("channel_name")
        if ch_url and ch_name and ch_url not in channel_map:
            channel_map[ch_url] = ch_name

    if not channel_map:
        print("  No channels with URLs found in the index.")
        return

    # Load existing data to allow incremental updates
    output_path = os.path.join(docs_dir, "ytpoopers_index.json")
    existing = {}
    if os.path.exists(output_path):
        try:
            with open(output_path, encoding="utf-8") as f:
                existing = json.load(f)
        except Exception:
            existing = {}

    # Initial population: ensure every channel in index is in ytpoopers_index.json
    added_new = False
    for ch_url, ch_name in channel_map.items():
        if ch_url not in existing:
            existing[ch_url] = {
                "channel_name": ch_name,
                "channel_url": ch_url,
                "description": None,
                "subscriber_count": None,
                "creation_date": None,
                "thumbnail": None,
            }
            added_new = True
    
    if added_new:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(existing, f, separators=(',', ':'), ensure_ascii=False)
        print(f"  Updated {output_path} with new channels from index.")

    thumb_dir = os.path.join(docs_dir, "profile_thumbnails")
    os.makedirs(thumb_dir, exist_ok=True)

    total = len(channel_map)
    print(f"  Found {total} unique channel(s) to scrape.")
    print(f"  Already scraped channels will be skipped.")
    print()

    scraped = skipped = failed = 0

    for i, (ch_url, ch_name) in enumerate(channel_map.items(), 1):
        pct = i / total * 100
        pb = bar(pct, 26)
        print(f"\r  {pb}  {i}/{total}  ok={scraped} skip={skipped} fail={failed}  ",
              end="", flush=True)

        # Skip if already scraped
        if ch_url in existing and existing[ch_url].get("description") is not None:
            skipped += 1
            continue

        # Use yt-dlp to get channel about page metadata
        about_url = ch_url.rstrip("/")
        about_url = re.sub(r'/(videos|shorts|streams|playlists|about|community|featured)$', '', about_url)

        try:
            r = subprocess.run(
                ["yt-dlp", "--dump-json", "--playlist-items", "0",
                 "--no-warnings", "--socket-timeout", "20", about_url],
                capture_output=True, text=True, timeout=60,
            )

            profile = {
                "channel_name": ch_name,
                "channel_url": ch_url,
                "description": None,
                "subscriber_count": None,
                "creation_date": None,
                "thumbnail": None,
            }

            if r.returncode == 0 and r.stdout.strip():
                raw = next(
                    (l for l in reversed(r.stdout.splitlines()) if l.strip().startswith("{")),
                    None,
                )
                if raw:
                    d = json.loads(raw)
                    profile["channel_name"] = d.get("uploader") or d.get("channel") or ch_name
                    profile["description"] = d.get("description") or ""
                    profile["subscriber_count"] = d.get("channel_follower_count")

                    # Upload date of first video as proxy for channel creation
                    raw_date = d.get("upload_date")
                    if raw_date and len(raw_date) == 8:
                        profile["creation_date"] = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:]}"

                    # Download channel thumbnail
                    thumb_url = None
                    thumbnails = d.get("thumbnails") or []
                    # Try channel-level avatar from uploader_url or pick last thumbnail
                    if thumbnails:
                        thumb_url = thumbnails[-1].get("url")

                    if not thumb_url:
                        # Try channel_thumbnails field (some yt-dlp versions)
                        for t in (d.get("channel_thumbnails") or []):
                            thumb_url = t.get("url")

                    if thumb_url:
                        safe_name = re.sub(r'[<>:"/\\|?*]', '_', ch_name)[:60]
                        thumb_ext = "jpg"
                        thumb_file = os.path.join(thumb_dir, f"{safe_name}.{thumb_ext}")
                        try:
                            urllib.request.urlretrieve(thumb_url, thumb_file)
                            profile["thumbnail"] = f"profile_thumbnails/{safe_name}.{thumb_ext}"
                        except Exception:
                            pass

            existing[ch_url] = profile
            scraped += 1

        except subprocess.TimeoutExpired:
            failed += 1
        except Exception:
            failed += 1

        # Save periodically
        if i % 10 == 0:
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(existing, f, separators=(',', ':'), ensure_ascii=False)

        time.sleep(0.5)

    clear_line()

    # Final save
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(existing, f, separators=(',', ':'), ensure_ascii=False)

    print(f"  Done. Scraped: {scraped}  Skipped: {skipped}  Failed: {failed}")
    print(f"  Profiles saved to: {os.path.abspath(output_path)}")
    print(f"  Thumbnails saved to: {os.path.abspath(thumb_dir)}")


def do_scrape_sources_metadata(index):
    src_path = os.path.join(index.docs_dir, "sources_index.json")
    if not os.path.exists(src_path):
        print(f"  [!] {src_path} not found.")
        return

    with open(src_path, encoding="utf-8") as f:
        sources_data = json.load(f)

    need_meta = [vid for vid, e in sources_data.items() if (
        e.get("title") is None or
        e.get("description") is None or
        e.get("channel_name") is None or
        e.get("channel_url") is None or
        e.get("publish_date") is None or
        e.get("view_count") is None or
        e.get("like_count") is None or 
        e.get("title") == "warnings.warn("
    ) and e.get("status") != "unavailable"]

    if not need_meta:
        print("  All videos in sources_index.json already have metadata.")
        return

    total_meta = len(need_meta)
    print(f"  Fetching YouTube metadata for {total_meta} sources videos")
    print(f"  (title, description, channel link, tags)...")
    print()

    for i, vid in enumerate(need_meta, 1):
        overall_pct = i / total_meta * 100
        ov_bar = bar(overall_pct, 30)
        print(f"\r  {ov_bar}  {i}/{total_meta}", end="", flush=True)

        meta = fetch_yt_metadata(vid)
        e = sources_data[vid]
        if meta == "unavailable":
            e["status"] = "unavailable"
        elif meta:
            if meta.get("title"): e["title"] = meta["title"]
            if meta.get("description") is not None: e["description"] = meta["description"]
            if meta.get("channel_name"): e["channel_name"] = meta["channel_name"]
            if meta.get("channel_url"): e["channel_url"] = meta["channel_url"]
            if meta.get("publish_date") is not None: e["publish_date"] = meta["publish_date"]
            if meta.get("view_count") is not None: e["view_count"] = meta["view_count"]
            if meta.get("like_count") is not None: e["like_count"] = meta["like_count"]
            if meta.get("tags") is not None: e["tags"] = meta["tags"]
            
            # Tag missing profile names from URL if null
            if not e.get("channel_name") and e.get("channel_url"):
                url = e["channel_url"]
                url_clean = url.split("?")[0].rstrip("/")
                extracted = None
                if "/@" in url_clean:
                    extracted = url_clean.split("/@")[-1]
                elif "/user/" in url_clean:
                    extracted = url_clean.split("/user/")[-1]
                elif "/c/" in url_clean:
                    extracted = url_clean.split("/c/")[-1]
                if extracted:
                    e["channel_name"] = extracted

        if i % 20 == 0:
            with open(src_path, "w", encoding="utf-8") as f:
                json.dump(sources_data, f, separators=(',', ':'), ensure_ascii=False)

    clear_line()
    with open(src_path, "w", encoding="utf-8") as f:
        json.dump(sources_data, f, separators=(',', ':'), ensure_ascii=False)

    print(f"  Done — sources_index.json metadata updated.")

def do_scrape_comments(index, video_dir):
    """Scrape comments for every non-unavailable video in sources_index.json."""
    comments_dir = os.path.join(video_dir, "comments")
    os.makedirs(comments_dir, exist_ok=True)

    src_path = os.path.join(index.docs_dir, "sources_index.json")
    if not os.path.exists(src_path):
        print(f"  [!] {src_path} not found.")
        return

    with open(src_path, encoding="utf-8") as f:
        sources_data = json.load(f)

    videos = [(vid, e) for vid, e in sources_data.items()
              if e.get("status") != "unavailable"]
    total = len(videos)

    if not videos:
        print("  No videos to scrape comments for.")
        return

    print(f"  Scraping comments for {total} video(s)...")
    print(f"  Already-scraped videos will be skipped.")
    print()

    done = skipped = failed = 0

    for i, (vid, e) in enumerate(videos, 1):
        pct = i / total * 100
        pb = bar(pct, 26)
        print(f"\r  {pb}  {i}/{total}  done={done} skip={skipped} fail={failed}  ",
              end="", flush=True)

        comment_file = os.path.join(comments_dir, f"{vid}.json")
        if os.path.exists(comment_file):
            skipped += 1
            continue

        url = canonical_yt_url(vid)
        try:
            r = subprocess.run(
                ["yt-dlp", "--dump-single-json", "--write-comments",
                 "--no-warnings", "--socket-timeout", "30", url],
                capture_output=True, text=True, timeout=120,
            )
            if r.returncode == 0 and r.stdout.strip():
                raw = next(
                    (l for l in reversed(r.stdout.splitlines()) if l.strip().startswith("{")),
                    None,
                )
                if raw:
                    d = json.loads(raw)
                    comments = d.get("comments") or []
                    with open(comment_file, "w", encoding="utf-8") as f:
                        json.dump(comments, f, separators=(',', ':'), ensure_ascii=False)
                    done += 1
                else:
                    failed += 1
            else:
                failed += 1
        except Exception:
            failed += 1

        time.sleep(0.3)

    clear_line()
    print(f"  Done. Scraped: {done}  Skipped (already done): {skipped}  Failed: {failed}")
    print(f"  Comments saved to: {os.path.abspath(comments_dir)}")


def create_progressive_backup(index, step_name):
    if os.path.exists(index.filepath):
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_step = re.sub(r'[^a-z0-9]', '_', step_name.lower())
        bak_name = f"video_index_{ts}_{safe_step}.json.bak"
        bak_path = os.path.join(os.path.dirname(index.filepath), bak_name)
        try:
            shutil.copyfile(index.filepath, bak_path)
            print(f"  [Backup] Created: {bak_name}")
        except Exception as e:
            print(f"  [!] Failed to create backup: {e}")


def do_full_scrape_run(index, args):
    print("\n>>> Starting Full Scrape Run...")
    
    print("\nStep 1: Scrape Channels (Option 3)")
    do_scrape_channels(index)
    create_progressive_backup(index, "step1_channels")
    
    print("\nStep 2: Fetch Missing Metadata (Option 1)")
    do_update_index(index)
    do_scrape_sources_metadata(index)
    create_progressive_backup(index, "step2_metadata")
    
    print("\nStep 3: Scrape Thumbnails and Tag Missing Profiles (Option 7)")
    do_scrape_thumbnails(index, args.docs_dir)
    create_progressive_backup(index, "step3_thumbnails")
    
    print("\nStep 4: Scrape Comments (Option 6)")
    do_scrape_comments(index, args.docs_dir)
    create_progressive_backup(index, "step4_comments")
    
    print("\n>>> Full Scrape Run Complete.")

    # Create a progressive backup
    if os.path.exists(index.filepath):
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        bak_name = f"video_index_{ts}.json.bak"
        bak_path = os.path.join(os.path.dirname(index.filepath), bak_name)
        try:
            shutil.copyfile(index.filepath, bak_path)
            print(f"  [Backup] Created progressive backup: {bak_name}")
        except Exception as e:
            print(f"  [!] Failed to create progressive backup: {e}")


def do_full_download_parallel():
    print("\n>>> Launching Full Download in parallel terminals...")
    # Path to scripts
    scraper_script = os.path.abspath(__file__)
    # Find compress_videos.py in the same directory as this script
    compressor_script = os.path.join(os.path.dirname(scraper_script), "compress_videos.py")

    
    # Commands to run
    # 1. Option 6: Scrape comments
    cmd6 = f'python "{scraper_script}" --scrape-comments'
    # 2. Option 4 Lang 1: Download Italian
    cmd4 = f'python "{scraper_script}" --download-italian'
    # 3. compress_videos.py
    cmdC = f'python "{compressor_script}"'

    print(f"  [+] Starting: {cmd6}")
    subprocess.Popen(f'start cmd /k {cmd6}', shell=True)
    
    print(f"  [+] Starting: {cmd4}")
    subprocess.Popen(f'start cmd /k {cmd4}', shell=True)
    
    print(f"  [+] Starting: {cmdC}")
    subprocess.Popen(f'start cmd /k {cmdC}', shell=True)
    
    print("\n>>> All processes launched.")


# ── Menu helpers ──────────────────────────────────────────────────────────────

def ask(prompt, choices):
    while True:
        ans = input(prompt).strip().lower()
        if ans in choices:
            return ans
        print(f"  Please enter one of: {' / '.join(choices)}")


def print_header():
    print()
    print("╔══════════════════════════════════════════════════╗")
    print("║   YTP Backup — YouTube Index & Downloader        ║")
    print("╚══════════════════════════════════════════════════╝")
    print()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    import io
    if hasattr(sys.stdout, 'buffer'):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

    p = argparse.ArgumentParser(add_help=False)
    p.add_argument("--site-dir",        default=DEFAULT_SITE_DIR)
    p.add_argument("--video-dir",       default=DEFAULT_VIDEO_DIR)
    p.add_argument("--docs-dir",        default=DEFAULT_DOCS_DIR)
    p.add_argument("--format",          default=DEFAULT_FORMAT)
    p.add_argument("--rate-limit",      default=None)
    p.add_argument("--retry-failed",    action="store_true")
    p.add_argument("--stats",           action="store_true",
                   help="Write stats.md and exit")
    p.add_argument("--chronology",      action="store_true",
                   help="Print top-20 most-viewed videos by year and exit")
    p.add_argument("--dump-poopers",    metavar="OUTPUT", nargs="?", const="poopers.md",
                   help="Dump pooper table to Markdown file (default: poopers.md)")
    p.add_argument("--find-mirrors",    action="store_true",
                   help="Search YouTube for reuploads of unavailable videos")
    p.add_argument("--scrape-comments", action="store_true",
                   help="Scrape comments for all indexed videos")
    p.add_argument("--scrape-profiles", action="store_true",
                   help="Scrape channel profiles and save to docs/ytpoopers_index.json")
    p.add_argument("--download-italian", action="store_true",
                   help="Run option 4 with language 1 (Italian) and exit")
    p.add_argument("--forum-scrape",    action="store_true",
                   help="Analyze every folder in site_mirror and sort videos")
    p.add_argument("--year-limit",      type=int, default=2016,
                   help="Limit downloads to videos published until this year (for language mode)")
    args, _ = p.parse_known_args()

    if not os.path.isdir(args.site_dir):
        print(f"[!] site_dir not found: {args.site_dir}")
        sys.exit(1)

    if args.stats or args.chronology or args.dump_poopers or args.find_mirrors or args.scrape_comments or args.scrape_profiles or args.download_italian or args.forum_scrape:
        index = VideoIndex(args.video_dir, args.docs_dir)
        index.load()
        if args.stats:
            do_stats(index)
            index.cleanup_index()
        if args.chronology:
            do_chronology(index)
        if args.find_mirrors:
            do_find_mirrors(index)
        if args.scrape_comments:
            do_scrape_comments(index, args.docs_dir)
        if args.scrape_profiles:
            do_scrape_profiles(index, args.docs_dir)
        if args.download_italian:
            do_download_language(index, args.video_dir, args.format, args.rate_limit, args.retry_failed, ITALIAN_CHANNELS, "italian", year_limit=args.year_limit, skip_scan=False)
        if args.forum_scrape:
            do_forum_scrape(index, args.site_dir)
        return

    print_header()
    print(f"  Site dir:  {os.path.abspath(args.site_dir)}")
    print(f"  Video dir: {os.path.abspath(args.video_dir)}")
    print(f"  Docs dir:  {os.path.abspath(args.docs_dir)}")
    print(f"  Sections:  {', '.join(SCAN_SECTIONS)}")
    print()
    print("  What do you want to do?")
    print()
    print("  1  Fetch missing metadata")
    print("       Fetch missing metadata. Will NOT fetch new videos.")
    print()
    print("  2  Download indexed videos")
    print("       Download pending videos.")
    print()
    print("  3  Scrape channels")
    print("       Scrape all index channels + allowed-channel list;")
    print("       add YTP matches to 'Youtube' section.")
    print()
    print("  4  Download YTPs from selected language")
    print("       Download videos from ALLOWED_CHANNELS, 'YTP nostrane', or 'YTP fai da te'.")
    print()
    print("  5  Find mirror videos")
    print("       Search YouTube for reuploads of unavailable videos.")
    print()
    print("  6  Scrape comments")
    print("       Fetch comments for every indexed video in sources_index.json.")
    print()
    print("  7  Scrape thumbnails and tag missing profiles")
    print("       Download profile pictures for channels in ytpoopers_index.json")
    print()
    print("  8  Auto languages")
    print("       Automatically tag languages for all videos.")
    print()
    print("  9  Stats  →  stats.md")
    print("       Section & channel breakdown (sources_index.json only).")
    print()
    print("  f  Forum Scrape")
    print("       Analyze every folder in site_mirror to find YouTube videos.")
    print()
    print("  s  Full Scrape Run")
    print("       Sequential: Option 3 -> 1 -> 7 -> 6.")
    print()
    print("  d  Full Download (Parallel)")
    print("       Parallel: Option 6, Option 4 (ITA), compress_videos.py.")
    print()
    print("  a  Full Cycle")
    print("       Full Scrape Run followed by Full Download (Parallel).")
    print()
    print("  q  Quit")
    print()
    choice = ask("  Choice [1-9/f/s/d/a/q]: ",
                 {"1","2","3","4","5","6","7","8","9","f","s","d","a","q"})

    if choice == "q":
        sys.exit(0)

    print()

    index = VideoIndex(args.video_dir, args.docs_dir)
    index.load()

    if choice == "1":
        print("\nSelect what metadata to fetch:")
        print("1. All (video_index.json & sources_index.json)")
        print("2. Only YTP metadata (video_index.json)")
        print("3. Only sources metadata (sources_index.json)")
        sub = ask("Choice [1-3]: ", {"1", "2", "3"})
        if sub in ("1", "2"):
            do_update_index(index)
        if sub in ("1", "3"):
            do_scrape_sources_metadata(index)
        print()
    if choice == "2":
        print("\nSelect what to download:")
        print("1. All (video_index.json & sources_index.json)")
        print("2. Only YTP videos (video_index.json)")
        print("3. Only sources videos (sources_index.json)")
        sub = ask("Choice [1-3]: ", {"1", "2", "3"})
        if sub in ("1", "2"):
            do_download(index, args.video_dir, args.format, args.rate_limit, args.retry_failed)
        if sub in ("1", "3"):
            do_download_risorse(index, args.video_dir, args.format, args.rate_limit, args.retry_failed)
        print()
    if choice == "3":
        do_scrape_channels(index)
        print()
    if choice == "4":
        print("\nSelect Language:")
        print("1. Italian")
        print("2. English")
        print("3. Spanish")
        print("4. German")
        print("5. French")
        print("6. Russian")
        lang_choice = input("Language Choice [1-6]: ").strip()
        skip_input = input("Skip the scan? (y/n): ").strip().lower()
        should_skip = skip_input == 'y'
        
        selected_list = []
        lang_name = None
        if lang_choice == "1": 
            selected_list = ITALIAN_CHANNELS
            lang_name = "italian"
        elif lang_choice == "2": 
            selected_list = ENGLISH_CHANNELS
            lang_name = "english"
        elif lang_choice == "3": 
            selected_list = SPANISH_CHANNELS
            lang_name = "spanish"
        elif lang_choice == "4": 
            selected_list = GERMAN_CHANNELS
            lang_name = "german"
        elif lang_choice == "5": 
            selected_list = FRENCH_CHANNELS
            lang_name = "french"
        elif lang_choice == "6": 
            selected_list = RUSSIAN_CHANNELS
            lang_name = "russian"
        
        if lang_name:
            do_download_language(index, args.video_dir, args.format, args.rate_limit, args.retry_failed, selected_list, lang_name, year_limit=args.year_limit, skip_scan=should_skip)
        else:
            print("Invalid language selection.")

    if choice == "5":
        do_find_mirrors(index)

    if choice == "6":
        do_scrape_comments(index, args.docs_dir)

    if choice == "7":
        do_scrape_thumbnails(index, args.docs_dir)

    if choice == "8":
        do_auto_languages(index)

    if choice == "9":
        do_stats(index)
        index.cleanup_index()

    if choice == "f":
        do_forum_scrape(index, args.site_dir)

    if choice == "s":
        do_full_scrape_run(index, args)

    if choice == "d":
        do_full_download_parallel()

    if choice == "a":
        do_full_scrape_run(index, args)
        do_full_download_parallel()



    print()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        import traceback
        print("\n[!] Unexpected error:")
        traceback.print_exc()
    except KeyboardInterrupt:
        print("\n  Interrupted.")
    finally:
        print()
        try:
            if sys.stdin.isatty():
                input("  Press Enter to close...")
        except (EOFError, OSError):
            pass
